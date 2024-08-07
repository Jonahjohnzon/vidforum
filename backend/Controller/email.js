const nodemailer = require("nodemailer");
require('dotenv').config()

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    // TODO: replace `user` and `pass` values from <https://forwardemail.net>
    user: process.env.USEREMAIL,
    pass: process.env.PASS,
  },
});

module.exports ={
    verifyEmail: async function verifyEmail({userEmail, token}){
            try{
              
                 await transporter.sendMail({
                    from: '"VIDFORUM 👻" <foo@example.com>',
                    to: userEmail,
                    subject: " Verify Email Address ✔",
                    text: "",
                    html : `<b>Hello</b><br/><p>Please verify your vidforum account by clicking the link</p><br/><B>LINK NOT ACCEPTABLE AFTER ONE HOUR</B> <br/>https://vidplus.com.ng/activate/${token}`
                })
            
            }
            catch(e){
              console.log(e)
            }
    },
    verifyPass: async function verifyEmail({userEmail, token}){
      try{
        
           await transporter.sendMail({
              from: '"VIDFORUM PASSWORD CHANGE 👻" <foo@example.com>',
              to: userEmail,
              subject: " Link To Change Password ✔",
              text: "",
              html : `<b>Hello</b><br/><p>Please verify you want to change your password by clicking the link</p><br/><B>LINK NOT ACCEPTABLE AFTER ONE HOUR</B> <br/>https://vidplus.com.ng/password/${token}`
          })
      
      }
      catch(e){
        console.log(e)
      }
}
}