const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require("mongodb");
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();
//midlewares
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nbna82s.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run(){
    try{
        const appointmentOptionsCollection = client
          .db("doctorsPortal")
          .collection("appointmentOptions");
        const bookingsCollection = client
          .db("doctorsPortal")
          .collection("bookings");
          //get data
          app.get('/appointmentOptions', async(req, res)=> {
            const query = {};
            const options = await appointmentOptionsCollection.find(query).toArray();
            res.send(options);
          });
          //insert data
          app.post('/bookings', async(req, res)=> {
            const booking = req.body;
            console.log(booking);
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
          })
    }
    finally{

    }
}
run().catch(error=> console.log(error))

app.get('/', async(req, res)=> {
    res.send('Doctors Portal Server is running!')
});
app.listen(port, ()=> console.log(`Doctors portal is running on port ${port}`))