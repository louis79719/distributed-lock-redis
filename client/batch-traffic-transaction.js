const axios = require('axios')

let numberOfTransactions = process.argv[2]
let sentTransactions = 0
console.log(numberOfTransactions)

async function thread() {
  const httpClient = axios.create({
    baseURL: 'http://localhost:8080',
  })

  numberOfTransactions--
  if(numberOfTransactions >= 0) {
    await httpClient.post('v3/transaction', {
      to: "001",
      amount: 1,
    })
    
    sentTransactions++
    console.log(`#${sentTransactions}-th request finished`)
    return thread()
  } else {
    return
  }
}

async function main() {
  const concurrencies = 5
  for(let i=0; i<concurrencies; i++) {
    thread()
  }
}

main()