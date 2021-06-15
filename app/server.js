const AWS = require('aws-sdk')
const express = require('express')
const helmet = require('helmet')
const bodyParser = require('body-parser')
const Redis = require('ioredis')
const Redlock = require('redlock')

const awsRegion = process.env.AWS_REGION || 'eu-central-1'
const dynamo = new AWS.DynamoDB.DocumentClient({
  region: awsRegion,
});

const app = express()
const port = process.env.PORT || 8080

app.use(helmet());
app.use(bodyParser.json())

app.get('/account/:id', async (req, res, next) => {
  try {
    const accountId = req.params.id
    const { Item } = await dynamo.get({
      TableName: 'accounts',
      Key: {
        id: accountId,
      },
    }).promise();

    if(Item) {
      res.send(JSON.stringify(Item))
    } else {
      res.status(404).send()
    }
  } catch (err) {
    next(err)
  }
});

app.post('/account/:id', async (req, res, next) => {
    try {
      const accountId = req.params.id
      const payload = req.body
      const { balance } = payload
      const balanceValue = Number(balance)

      if (Number.isNaN(balanceValue)) {
        return res.status(400).send('Invalid format')
      }

      const { Attributes } = await dynamo.put({
        TableName: 'accounts',
        Item: {
          id: accountId,
          balance: Number(balance),
        },
        ReturnValues: 'ALL_OLD',
      }).promise()
      res.send(JSON.stringify(Attributes))
    } catch (err) {
      next(err)
    }
  });

app.post('/v1/transaction', async (req, res, next) => {
  try {
    const payload = req.body
    const { to, amount } = payload
    const amountValue = Number(amount)

    if (Number.isNaN(amountValue)) {
      return res.status(400).send('Invalid format')
    }

    const { Item } = await dynamo.get({
        TableName: 'accounts',
        Key: {
          id: to,
        },
    }).promise();
    const { Attributes } = await dynamo.update({
      TableName: 'accounts',
      Key: {
          id: to,
      },
      UpdateExpression: 'set balance = :newBalance',
      ExpressionAttributeValues: {
        ':newBalance': Item.balance + amountValue,
      },
      ReturnValues: 'UPDATED_NEW',
    }).promise()

    res.send(JSON.stringify(Attributes))
  } catch (err) {
    next(err)
  }
});

app.post('/v2/transaction', async (req, res, next) => {
  try {
    const payload = req.body
    const { to, amount } = payload
    const amountValue = Number(amount)

    if (Number.isNaN(amountValue)) {
      return res.status(400).send('Invalid format')
    }

    const { Attributes } = await dynamo.update({
      TableName: 'accounts',
      Key: {
          id: to,
      },
      UpdateExpression: 'set balance = balance + :amount',
      ExpressionAttributeValues: {
        ':amount': amountValue,
      },
      ReturnValues: 'UPDATED_NEW',
    }).promise()

    res.send(JSON.stringify(Attributes))
  } catch (err) {
    next(err)
  }
});

// version 3: distributed lock
async function tryLock(redlock, key, ttl) {
  try {
    const lock = await redlock.lock(key, ttl)
    return lock
  } catch (err) {
    console.error(err)
    return tryLock(redlock, key, ttl)
  }
}

app.post('/v3/transaction', async (req, res, next) => {
  try {
    const payload = req.body
    const { to, amount } = payload
    const amountValue = Number(amount)

    if (Number.isNaN(amountValue)) {
      return res.status(400).send('Invalid format')
    }

    // lock distributed lock
    const redisClients = [
      new Redis(10001, 'localhost'),
      new Redis(10002, 'localhost'),
      new Redis(10003, 'localhost'),
    ];
    const redlock = new Redlock(
      redisClients,
      {
        // the expected clock drift; for more details
        // see http://redis.io/topics/distlock
        driftFactor: 0.01, // multiplied by lock ttl to determine drift time
    
        // the max number of times Redlock will attempt
        // to lock a resource before erroring
        retryCount:  10,
    
        // the time in ms between attempts
        retryDelay:  200, // time in ms
    
        // the max time in ms randomly added to retries
        // to improve performance under high contention
        // see https://www.awsarchitectureblog.com/2015/03/backoff.html
        retryJitter:  200 // time in ms
      }
    );
    const lock = await tryLock(redlock, `${to}:transaction`, 1000)

    const { Item } = await dynamo.get({
      TableName: 'accounts',
      Key: {
        id: to,
      },
    }).promise();
    const { Attributes } = await dynamo.update({
      TableName: 'accounts',
      Key: {
        id: to,
      },
      UpdateExpression: 'set balance = :newBalance',
      ExpressionAttributeValues: {
        ':newBalance': Item.balance + amountValue,
      },
      ReturnValues: 'UPDATED_NEW',
    }).promise()

    // release distributed lock
    await lock.unlock()

    res.send(JSON.stringify(Attributes))
  } catch (err) {
    next(err)
  }
});

app.use('/', (req, res) => {
  res.send('Fallback routes')
});

app.use((err, req, res, next) => {
  if (err) {
    console.error(err)
    res.status(500).send()
  }
});

app.listen(port, () => {
  console.log(`Running on port ${port}`)
});