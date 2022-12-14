const express = require('express')
const cors = require('cors');
const nodemailer = require("nodemailer");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require('jsonwebtoken');

require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
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

function sendBookingEmail(booking){

}
function verifyJWT(req, res, next){
      const authHeader = req.headers.authorization;
      if(!authHeader){
        return res.status(401).send({message: 'Unauthorized Access!'})
      }
      const token = authHeader.split(' ')[1];
      
      jwt.verify(token, process.env.ACCESS_TOKEN, function(error, decoded){
        if(error){
          return res.status(403).send({message: 'Forbidded Access!'})
        }
        req.decoded =decoded;
        next();
      });
}

async function run(){
    try{
      const appointmentOptionsCollection = client
        .db("doctorsPortal")
        .collection("appointmentOptions");
      const bookingsCollection = client
        .db("doctorsPortal")
        .collection("bookings");
      const usersCollection = client.db("doctorsPortal").collection("users");
      const doctorsCollection = client.db("doctorsPortal").collection("doctors");
      const paymentsCollection = client.db("doctorsPortal").collection("payments");
      //use need to call frist veriJwt then call this admin verify function~!
      const verifyAdmin = async(req,res, next)=> {
        
        const decodedEmail = req.decoded.email;
        const query = { email: decodedEmail };
        const user = await usersCollection.findOne(query);
        if (user?.role !== "admin") {
          return res.status(403).send({ message: "Forbidden Access!" });
        }
        
        next();
      }
      //use agregate to multiple query colletions
      //get data
      app.get("/appointmentOptions", async (req, res) => {
        const date = req.query.date;
        const query = {};
        const options = await appointmentOptionsCollection
          .find(query)
          .toArray();
        //get the booking by providing date
        const bookingQuer = { appointmentDate: date };
        const alreadyBooked = await bookingsCollection
          .find(bookingQuer)
          .toArray();
        //valo kore buje naw
        options.forEach((option) => {
          const optionBooked = alreadyBooked.filter(
            (book) => book.treatment === option.name
          );
          const bookedSlots = optionBooked.map((book) => book.slot);
          const remaningSlots = option.slots.filter(
            (slot) => !bookedSlots.includes(slot)
          );
          option.slots = remaningSlots;
        });
        res.send(options);
      });

      ///--------------version 2
      app.get("/v2/appointmentOptions", async (req, res) => {
        const date = req.query.date;
        const options = await appointmentOptionsCollection
          .aggregate([
            {
              $lookup: {
                from: "bookings",
                localField: "name",
                foreignField: "treatment",
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$appointmentDate", date],
                      },
                    },
                  },
                ],
                as: "booked",
              },
            },
            {
              $project: {
                name: 1,
                price: 1,
                slots: 1,
                booked: {
                  $map: {
                    input: "$booked",
                    as: "book",
                    in: "$$book.slot",
                  },
                },
              },
            },
            {
              $project: {
                name: 1,
                price: 1,
                slots: {
                  $setDifference: ["$slots", "$booked"],
                },
              },
            },
          ])
          .toArray();
        res.send(options);
      });
      //speciality
      app.get('/appointmentSpeciality', async(req, res)=> {
        const query = {};
        const result = await appointmentOptionsCollection.find(query).project({name: 1}).toArray();
        res.send(result);
      })
      //get booking by user email
      app.get("/bookings",verifyJWT,  async (req, res) => {
        const email = req.query.email;
        const decodedEmail = req.decoded.email;
        if(email !== decodedEmail){
          return res.status(403).send({message: 'Forbidded Access!'})
        }
        const query = { email: email };
        const bookings = await bookingsCollection.find(query).toArray();
        res.send(bookings);
      });
      app.get('/bookings/:id', async(req, res)=> {
        const id = req.params.id;
        const filter = {_id: ObjectId(id)};
        const result = await bookingsCollection.findOne(filter);
        res.send(result);
      })
      //insert data
      app.post("/bookings", async (req, res) => {
        const booking = req.body;
        
        const query = {
          appointmentDate: booking.appointmentDate,
          email: booking.email,
          treatment: booking.treatment,
        };
        const alreadyBooked = await bookingsCollection.find(query).toArray();
        if (alreadyBooked.length) {
          const message = `You have already booking  on ${booking.treatment}`;
          return res.send({ acknowlaged: false, message });
        }
        const result = await bookingsCollection.insertOne(booking);
        //send email about confrim booking
        sendBookingEmail(booking);
        res.send(result);
      });
     
      //issue jwt
      app.get('/jwt', async(req, res)=> {
        const email = req.query.email;
        const query = {email: email};
        const user = await usersCollection.findOne(query);
        if(user){
          const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {expiresIn: '1d'});
          return res.send({accessToken: token})
        }
        res.status(403).send({accesToken: ''})
      });
     app.post("/create-payment-intent", async (req, res) => {
       const booking = req.body;
       const price = booking.price;
       const amount = price * 100;

       const paymentIntent = await stripe.paymentIntents.create({
         currency: "usd",
         amount: amount,
         payment_method_types: ["card"],
       });
       res.send({
         clientSecret: paymentIntent.client_secret,
       });
     });
     app.post('/payments', async(req, res)=> {
      const payment  =req.body;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = {_id: ObjectId(id)};
      const updatedDoc = {
        $set: {
          paid: true,
          transitionId: payment.transitionId,
        }
      }
      const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc);
      res.send(result)
     })
      //get alluser
      app.get('/users', async(req, res)=> {
        const query = {};
        const user = await usersCollection.find(query).toArray();
        res.send(user);
      })
      //find admin user
      app.get('/users/admin/:email', async(req, res)=> {
        const email = req.params.email;
        const query = {email};
        const user = await usersCollection.findOne(query);
        res.send({isAdmin: user?.role === 'admin'});
      })
      //create user
      app.post('/users', async(req, res)=> {
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        res.send(result);
      });
      //make admin
      app.put('/users/admin/:id',verifyJWT, verifyAdmin, async(req, res)=> {
       
        const id = req.params.id;
        const filter = {_id: ObjectId(id)};
        const options = { upsert: true };
        const updatedDoc = {
          $set: {
            role: 'admin'
          }
        }
        const result = await usersCollection.updateOne(filter, updatedDoc, options);
        res.send(result);
      });
      //doctor 
      app.get('/doctors', verifyJWT, verifyAdmin, async(req, res)=> {
        const query = {};
        const doctors = await doctorsCollection.find(query).toArray();
        res.send(doctors)
      })
      app.post('/doctors', verifyJWT,verifyAdmin, async(req, res)=> {
        const doctor = req.body;
        const result = await doctorsCollection.insertOne(doctor);
        res.send(result);
      });
      app.delete('/doctors/:id', verifyJWT,verifyAdmin, async(req, res)=> {
        const id = req.params.id;
        const filter = {_id: ObjectId(id)};
        const result = await doctorsCollection.deleteOne(filter);
        res.send(result);
      });
      //temp update treatment price options 
      // app.put('/addprice', async(req, res)=> {
      //   const filter = {};
      //   const options = {upsert: true};
      //  const updatedDoc = {
      //    $set: {
      //      price: 99,
      //    },
      //  };
      //   const result = await appointmentOptionsCollection.updateMany(filter,updatedDoc, options);
      //   res.send(result);
      // })
    }
    finally{

    }
}
run().catch(error=> console.log(error))

app.get('/', async(req, res)=> {
    res.send('Doctors Portal Server is running!')
});
app.listen(port, ()=> console.log(`Doctors portal is running on port ${port}`))