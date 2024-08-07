const router = require('express').Router()
const {updateMgs,RemoveFollow ,get,register, login, notification, createthread, getThreads, getComment, commentthread, Like, deleteReply , Edit, getUser, getusePost, getAdmin, pushUsers, changePass , notify,  message, mgsalarm, metadata,PushFollow, Getfollowed, Toptheard, LatestThreads, deleteComment,deletePost, Edippost, updateUserStatus , Search, passchange,verifyemailtoken, passwordchange,  homemovie,  PushBlock } = require('../Controller/controller')
const verifyJwt = require('../Verification/verify.js')


router.post('/register', register)
router.post('/post/:postId/user/:userId/vote', verifyJwt, Like)
router.put('/postupdate/:postId/pid/:userId', verifyJwt, Edit)
router.post("/login", login)
router.get("/notification/:id", verifyJwt, notification)
router.get("/getUser/:id/:myid", verifyJwt, getUser)
router.get("/getPost/:id", verifyJwt, getusePost)
router.get("/getAdmin", getAdmin)
router.get("/getthreads/:cate/:index/:type", getThreads)
router.put('/pushUsers/:id', verifyJwt,pushUsers )
router.put("/changePass/:id", verifyJwt, changePass)
router.get("/getcomment/:id", getComment)
router.post("/createthread/:id", verifyJwt, createthread)
router.post("/commentthread/:id", verifyJwt, commentthread)
router.delete('/post/:postId/comment/:commentId/reply/:replyId/:userid', verifyJwt, deleteReply)
router.get("/notify/:id", verifyJwt, notify)
router.post("/message/:id/", verifyJwt, message)
router.get("/mgsalarm/:id", verifyJwt, mgsalarm)
router.get("/metadata", metadata)
router.get("/Getfollowed/:id/:index", verifyJwt, Getfollowed)
router.get("/updatemgs/:id", verifyJwt, updateMgs)
router.put('/PushFollow/:id', verifyJwt, PushFollow)
router.put('/PushBlock/:id', verifyJwt, PushBlock)
router.put('/RemoveFollow/:id', verifyJwt, RemoveFollow )
router.get("/Toptheard/:index", Toptheard)
router.get("/LatestThreads/:index", LatestThreads)
router.delete('/postdelete/:id/:userid', verifyJwt, deletePost);
router.delete('/post/:postId/comment/:commentId/:userid', verifyJwt, deleteComment);
router.put('/editpost/:id/:userid', verifyJwt, Edippost)
router.post('/userallow/:log/:id', verifyJwt, updateUserStatus);
router.get("/emailverify/:token" ,verifyemailtoken)
router.get("/get" ,get)
router.get('/search', Search)
router.post("/password",passchange)
router.post("/passchange",  passwordchange )
router.get('/homesearch/:id', homemovie  )







module.exports = router