const mongoose = require('mongoose')

const notification = mongoose.Schema({
    message:{
        type:String
    },
    data:{
        type:Date
    , default: Date.now},
    url:{
        type:String
    },
    title:{
        type:String
    },
    sender:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    sendername:{
        type:String
    }
})

const message = mongoose.Schema({
    text:{
        type:String
    },
    date:{
        type:Date
    , default: Date.now},
    sender:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    sendername:{
        type:String
    }
})

const  reply = mongoose.Schema({
    comment:{
        type: mongoose.Schema.Types.Mixed
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    vote:{
        type:Number
        , default: 0
    },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    downvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    quote:{
      type:Boolean,
      default:false
    },
    quoteid:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    quotemgs:{
        type:String 
    }
    ,
    postid:{
        type: mongoose.Schema.Types.ObjectId, ref: 'post' 
    },
    sequence: {
      type: String
    },  
    deleted: {
        type: Boolean, default: false
      }
},{timestamps:true})

const comment = mongoose.Schema({
    comment:{
        type: mongoose.Schema.Types.Mixed
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    vote:{
        type:Number
        , default: 0
    },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    downvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    reply:[reply],
    quote:{
        postid:{
            type: mongoose.Schema.Types.ObjectId, ref: 'post' 
        },
        text:{
            type:String
        },
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'user',
        }
    }
    ,
    postid:{
        type: mongoose.Schema.Types.ObjectId, ref: 'post' 
    },
    sequence: {
      type: String
    }, 
     deleted: {
        type: Boolean, default: false
      }

},{timestamps:true})

const user = mongoose.Schema({
    user_name:{
        type:String
    },
    email:{
        type:String
    }
    ,
    mod:{
        body:{
            type:Boolean,
        },
        category:{
            type:String,
        }
    },
    supermod:{
        type:Boolean
    },
    admin:{
        type:Boolean
    },
    password:{
        type:String
    },
    group_access:{
        type:Boolean
    },
    profile_image:{
        type:String
    },
    activated:{
        type:Boolean
    }
    ,
    rank:{
        type:Number
    },
    notification:{
        notify:[notification],
        alarm:{
            type:Boolean
        }},
    message:{
        message:[message],
        alarm:{
            type:Boolean
        }
    },
    blocked: [
        {
          userid: { type: String }
        }
      ],
    suspend:{
        type:Boolean
    },
    ban:{
        type:Boolean
    },
    allowmgs:{
        type:Boolean,
        default:true

    },
    position:{
        type:String
    }
    ,
    suspendedAt: { type: Date, default: null },
    following: [{
        title:{type:String},
        postid: { type: mongoose.Schema.Types.ObjectId, ref: 'post' },
        url:{type:String}
    }]

},{timestamps:true})


const post = mongoose.Schema({
    title:{
        type:String
    },
    image:{
        type:String
    },
    category:{
        type:String
    },
    comment:[comment],
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    views:{
            type:Number,
            default:0
    },
    sticky:{
        type:Boolean
    }
    ,
    replyallow:{
        type:Boolean
    }
},{timestamps:true})

post.index({ title: 'text' });
post.index({ 'comment.comment': 'text', 'comment.reply.comment': 'text' });


module.exports.user = mongoose.model('user', user)
module.exports.post = mongoose.model('post', post)