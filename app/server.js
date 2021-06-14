const AWS = require('aws-sdk')
const express = require('express')
const helmet = require('helmet')
const bodyParser = require('body-parser')

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

app.post('/transaction', async (req, res, next) => {
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