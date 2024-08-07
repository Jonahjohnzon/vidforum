const mongo = require('mongoose')

const mongoosedb = async()=>{
    try{
        const con = await mongo.connect(process.env.MONGO)
        console.log(`Mongo Connect: ${con.connection.host}`)
    }
    catch(err)
    {

    }
}
module.exports = mongoosedb