const express = require('express')
const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = ''

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server starts at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
  }
}

initializeDBAndServer()

//Getting user following people id's

const getFollowingPeopleIdsOfUser = async username => {
  const getFollowingPeoplequerry = `
  
  select following_user_id from follower inner join user on user.user_id = follower.follower_user_id where user.username = '${username}';`

  const followingPeople = await db.all(getFollowingPeoplequerry)
  const arrayOfIds = followingPeople.map(each => each.following_user_id)
  return arrayOfIds
}

//middleware

const authenticateToken = (req, res, next) => {
  let jwtToken
  const authHeader = req.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRECT_KEY', (err, payload) => {
      if (err) {
        res.status(401)
        res.send('Invalid JWT Token')
      } else {
        req.username = payload.username
        req.userId = payload.userId
        next()
      }
    })
  } else {
    res.status(401)
    res.send('Invalid JWT Token')
  }
}

//tweet access verification

const tweetAcccessVerification = async (req, res, next) => {
  const {userId} = req
  const {tweetId} = req.params
  const getTweetQuery = `
  select * from tweet inner join follower on tweet.user_id = follower.following_user_id where tweet.tweet_id = '${tweetId}' and follower_user_id = '${userId}';
  `
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    res.status(401)
    res.send('Invalid Request')
  } else {
    next()
  }
}

//API 1

app.post('/register/', async (req, res) => {
  const {username, password, name, gender} = req.body
  const selectQuery = `
    select * from user where username = '${username}';
    `
  const dbResult = await db.get(selectQuery)
  console.log(dbResult)
  if (dbResult === undefined) {
    console.log('new user')

    if (password.length < 6) {
      console.log('password is too short')
      res.status(400)
      res.send('Password is too short')
    } else {
      let hashedPassword = await bcrypt.hash(password, 10)
      const postQuery = `
            insert into user (username, password, name, gender) values ('${username}', '${hashedPassword}', '${name}', '${gender}');
            `
      await db.run(postQuery)
      console.log('user created successfully')
      res.status(200)
      res.send('User created successfully')
    }
  } else {
    console.log('User already exists')
    res.status(400)
    res.send('User already exists')
  }
})

//API 2

app.post('/login/', async (req, res) => {
  const {username, password} = req.body
  const selectQuerry = `
  select * from user where username = '${username}';
  `
  const dbUser = await db.get(selectQuerry)
  console.log(dbUser)

  if (dbUser === undefined) {
    console.log('invalid user')
    res.status(400)
    res.send('Invalid user')
  } else {
    console.log('user is present')
    let isPassword = await bcrypt.compare(password, dbUser.password)
    if (isPassword) {
      console.log('password is matched')
      const payload = {
        username,
        userId: dbUser.user_id,
      }
      const jwtToken = await jwt.sign(payload, 'SECRECT_KEY')
      res.send({jwtToken})
    } else {
      console.log('password is not matched')
      res.status(400)
      res.send('Invalid password')
    }
  }
})

//UserDetails

app.get('/', async (req, res) => {
  const selectQuery = `
  select * from user;
  `
  const dbResult = await db.all(selectQuery)
  res.send(dbResult)
})

//API 3

app.get('/user/tweets/feed/', authenticateToken, async (req, res) => {
  const {username} = req
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username)
  const getTweetsQuery = `
  select username, tweet, date_time as dateTime from user inner join tweet on user.user_id = tweet.user_id where user.user_id in (${followingPeopleIds}) order by date_time desc limit 4;
  `
  const tweets = await db.all(getTweetsQuery)
  res.send(tweets)
})

//API 4

app.get('/user/following/', authenticateToken, async (req, res) => {
  const {username, userId} = req
  const getFollowingUserQuery = `
  select name from follower inner join user on user.user_id = follower.following_user_id where follower_user_id = '${userId}';
  `
  const followingPeople = await db.all(getFollowingUserQuery)
  res.send(followingPeople)
})

//API 5

app.get('/user/followers/', authenticateToken, async (req, res) => {
  const {username, userId} = req
  const getFollowerQuery = `
  select distinct name from follower inner join user on user.user_id = follower.follower_user_id where following_user_id  = '${userId}';
  `
  const followers = await db.all(getFollowerQuery)
  res.send(followers)
})

//API 6

app.get(
  '/tweets/:tweetId',
  authenticateToken,
  tweetAcccessVerification,
  async (req, res) => {
    const {userId, username} = req
    const {tweetId} = req.params
    const getTweetQuery = `
    select tweet, 
    (select count() from like where tweet_id = '${tweetId}') as likes,
    (select count() from reply where tweet_id = '${tweetId}') as replies,
    date_time as dateTime from tweet where tweet.tweet_id = '${tweetId}';
  `
    const tweet = await db.get(getTweetQuery)
    res.send(tweet)
  },
)

//API 7

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  tweetAcccessVerification,
  async (req, res) => {
    const {tweetId} = req.params
    const getLikesQuery = `
  select username from user inner join like on user.user_id = like.user_id where tweet_id = '${tweetId}';
  `
    const likeUsers = await db.all(getLikesQuery)
    const userArray = likeUsers.map(eachUser => eachUser.username)
    res.send({likes: userArray})
  },
)

//API 8

app.get(
  '/tweets/:tweetID/replies/',
  authenticateToken,
  tweetAcccessVerification,
  async (req, res) => {
    const {tweetId} = req.params
    const getRepliedQuery = `
  select name, reply from user inner join reply on user.user_id = reply.user_id where tweet_id = ${tweetId};
  `
    const repliedUsers = await db.all(getRepliedQuery)
    res.send({replies: repliedUsers})
  },
)

//API 9

app.get('/user/tweets/', authenticateToken, async (req, res) => {
  const {userId} = req
  const getTweetQuery = `
    select tweet ,
    count(distinct like_id) as likes,
    count(distinct reply_id) as replies,
    date_time as dateTime
    from tweet left join reply on tweet.tweet_id = reply.tweet_id
    left join like on tweet.tweet_id = like.tweet_id 
    where tweet.user_id = ${userId}
    group by tweet.tweet_id;
    `
  const tweets = await db.all(getTweetQuery)
  res.send(tweets)
})

//API 10

app.post('/user/tweets/', authenticateToken, async (req, res) => {
  const {tweet} = req.body
  const userId = parseInt(req.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `
    insert into tweet (tweet, user_id, date_time) values ('${tweet}', '${userId}', '${dateTime}');
    `
  await db.run(createTweetQuery)
  res.send('Created a Tweet')
})

//API 11

app.delete('/tweets/:tweetId', authenticateToken, async (req, res) => {
  const {tweetId} = req.params
  const {userId} = req
  const getTheTweetQuery = `
    select * from tweet where user_id = '${userId}' and tweet_id = '${tweetId}';
    `
  const tweet = await db.get(getTheTweetQuery)
  console.log(tweet)
  if (tweet === undefined) {
    res.status(401)
    res.send('Invalid Request')
  } else {
    const deleteTweetQuery = `
      delete from tweet where tweet_id = '${tweetId}';
      `
    await db.run(deleteTweetQuery)
    res.send('Tweet Removed')
  }
})

module.exports = app
