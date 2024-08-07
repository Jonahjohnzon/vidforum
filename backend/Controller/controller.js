const { user, post } = require("../Schema/schema.js");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cron = require('node-cron');
const ogs = require('open-graph-scraper');
const mongoose = require('mongoose');
const verifyEmail = require('./email.js');


const calculateRank = (createdAt) => {
  const now = new Date();
  const accountAgeInMonths = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
  
  if (accountAgeInMonths >= 120) return 7; // 10 years or more
  if (accountAgeInMonths >= 96) return 6; // 8 years or more
  if (accountAgeInMonths >= 48) return 5; // 4 years or more
  if (accountAgeInMonths >= 24) return 4; // 2 years or more
  if (accountAgeInMonths >= 8) return 3; // 8 months or more
  if (accountAgeInMonths >= 2) return 2; // 2 months or more
  return 1; // less than 2 months
};

cron.schedule('0 * * * *', async () => { 
  try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // One hour ago
      await user.deleteMany({
        group_access: false,
        createdAt: { $lt: oneHourAgo },
      });
      
    } catch (error) {
      console.error('Error deleting unverified users:', error);
    }
});

cron.schedule('0 0 * * *', async () => {
  try {
      const users = await user.find();
      users.forEach(async (user) => {
          const newRank = calculateRank(user.createdAt);
          if (user.rank !== newRank) {
              user.rank = newRank;
              await user.save();
          }
      });
     
  } catch (error) {
      console.error('Error updating user ranks:', error);
  }
});

cron.schedule('0 0 * * *', async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const usersToUnsuspend = await user.find({
      suspend: true,
      suspendedAt: { $lte: oneMonthAgo }
    });

    for (const user of usersToUnsuspend) {
      user.suspend = false;
      user.suspendedAt = null;
      await user.save();
    }

    console.log(`Unsuspended ${usersToUnsuspend.length} users`);
  } catch (error) {
    console.error('Error unsuspending users:', error);
  }
});

const register = async (req, res) => {
  try { 
    
  const pass = req.body.password;
  const salt = await bcrypt.genSalt();
  const hash = await bcrypt.hash(pass, salt);
  const email = req.body.email.toUpperCase();
  const useraccount = await user.find({ email: email });
  const username = await user.find({ user_name: req.body.user_name });
  if (req.body.password !== req.body.confirmPassword) {
    return res.json({ create: false, message: "Password Does not Match" });
  }
  if (useraccount.length > 0) {
    return res.json({ create: false, message: "Email Already Exist" });
  }

  if (username.length > 0) {
    return res.json({ create: false, message: "Username Already Exist" });
  }

  
    const data = await user.create({
      user_name: req.body.user_name,
      rank: 1,
      email: email,
      mod: {body:false,category:" "},
      supermod: false,
      admin: false,
      password: hash,
      group_access: false,
      profile_image: "1",
      notification: {
        notify: {
          message:
            "🌟 Welcome to the ThreadMind community! Dive into discussions, share your passion, and make yourself at home. Enjoy your stay! 🚀",
        },
        alarm: true,
      },
      message: { alarm: false },
      suspend: false,
      ban: false,
      activated: false,
      blocked: [],
      following: [],
      allowmgs:true
    });

    await data.save();
    const emailtoken = JWT.sign({email}, process.env.EMI, { expiresIn: '1h' })
    verifyEmail.verifyEmail({
      userEmail: email,
      token: emailtoken
    })
    return res.json({
      create: true,
      message: "Activation Link Sent To Your Email",
    });
  } catch (e) {
    console.log(e);
  }
};

const metadata = async (req, res) => {
  try {
    const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required', timeout:false });
  }

  const options = { url };
  
    const data = await ogs(options);
    const { result } = data
    res.json({result, timeout:false});
  } catch (error) {
    let errorMessage = 'Failed to fetch metadata';
    if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Request timed out. Please try again later.';
    }

    res.status(500).json({ error: errorMessage, timeout:true });
  }
}

const get = async(req, res)=>{
  try {
    const posts = await post.find().populate({
      path: 'comment.reply',
      populate: {
          path: 'reply'
      }
  }).exec();

  const commentsArray = [];

  const addCommentsAndReplies = (comment, postz) => {
      const commentWithPostInfo = {
          ...comment.toObject(),
          postId: postz._id,
          postTitle: postz.title,
          postCategory: postz.category
      };
      commentsArray.push(commentWithPostInfo);
      if (comment.reply) {
          comment.reply.forEach(reply => addCommentsAndReplies(reply, postz));
      }
  };

  posts.forEach(postz => {
      postz.comment.forEach(comment => addCommentsAndReplies(comment, postz));
  });

    return res.json({commentsArray});
}catch(e)
{
  console.log(e)
}
}
const getThreads = async (req, res) => {
  try {
    const category = req.params.cate;
    const index = parseInt(req.params.index);
    const type = req.params.type;
    const limit = 15;  // Fetch 15 non-sticky posts
    const skip = (index - 1) * limit;

    let matchStage = { $match: { category: category } };

    let addFieldsStage = {
      $addFields: {
        replycount: {
          $sum: [
            { $size: "$comment" },
            {
              $reduce: {
                input: "$comment",
                initialValue: 0,
                in: { $add: ["$$value", { $size: "$$this.reply" }] },
              },
            },
          ],
        },
        comment: {
          $cond: {
            if: { $gt: [{ $size: "$comment" }, 0] }, // Check if comment array is not empty
            then: [
              { $arrayElemAt: ["$comment", 0] }, // First element
              { $arrayElemAt: ["$comment", { $subtract: [{ $size: "$comment" }, 1] }] } // Last element
            ],
            else: "$comment", // Return the single object as is
          },
        },
      },
    };
    

    let sortStage;
    switch (type) {
      case 'latest':
        sortStage = { $sort: { createdAt: -1 } }; // Sort by creation date descending
        break;
      case 'toppost':
        sortStage = { $sort: { replycount: -1 } }; // Sort by reply count descending
        break;
      case 'mostview':
        sortStage = { $sort: { views: -1 } }; // Sort by views descending
        break;
      case 'recent':
        sortStage = { $sort: { "comment.createdAt": -1, "comment.reply.createdAt": -1 } }; // Sort by latest comment/reply date descending
        break;
      default:
        throw new Error("Invalid type parameter");
    }

    let skipStage = { $skip: parseInt(skip) };
    let limitStage = { $limit: parseInt(limit) };

    const stickyPipeline = [
      { $match: { category: category, sticky: true } },
      addFieldsStage,
      sortStage
    ];

    const nonStickyPipeline = [
      { $match: { category: category, sticky: { $ne: true } } },
      addFieldsStage,
      sortStage,
      skipStage,
      limitStage
    ];

    const stickyPosts = await post.aggregate(stickyPipeline);
    const nonStickyPosts = await post.aggregate(nonStickyPipeline);

    const data = [...stickyPosts, ...nonStickyPosts];

    const total = await post.countDocuments({ category: category, sticky: { $ne: true } });
    const size = Math.ceil(total / limit);

    await post.populate(data,{
      path:'author',
        select: 'user_name profile_image'
    })

    await post.populate(data, {
      path: 'comment.author',
      select: 'user_name profile_image '
    });

  
    
    return res.json({ auth: true, data: data, size: size });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Internal server error" });
  }
};


const Toptheard = async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const limit = 15;
    const skip = (index - 1) * limit; // Calculate the number of documents to skip

    const data = await post.aggregate([
      {
        $match: { sticky: { $ne: true } } // Exclude posts where sticky is true
      },
      {
        $sort: { views: -1 } // Sort by views in descending order
      },
      {
        $addFields: {
          replycount: {
            $sum: [
              { $size: "$comment" },
              {
                $reduce: {
                  input: "$comment",
                  initialValue: 0,
                  in: { $add: ["$$value", { $size: "$$this.reply" }] }
                }
              }
            ]
          },
          comment: {
            $cond: {
              if: { $gt: [{ $size: "$comment" }, 1] },
              then: [
                { $arrayElemAt: ["$comment", 0] },
                {
                  $cond: {
                    if: {
                      $gt: [
                        {
                          $size: {
                            $arrayElemAt: [
                              "$comment.reply",
                              { $subtract: [{ $size: "$comment" }, 1] }
                            ]
                          }
                        },
                        0
                      ]
                    },
                    then: {
                      $arrayElemAt: [
                        "$comment.reply",
                        {
                          $subtract: [
                            {
                              $size: {
                                $arrayElemAt: [
                                  "$comment.reply",
                                  { $subtract: [{ $size: "$comment" }, 1] }
                                ]
                              }
                            },
                            1
                          ]
                        }
                      ]
                    },
                    else: {
                      $arrayElemAt: [
                        "$comment",
                        { $subtract: [{ $size: "$comment" }, 1] }
                      ]
                    }
                  }
                }
              ],
              else: "$comment"
            }
          }
        }
      },
      {
        $skip: skip // Skip to the calculated index
      },
      {
        $limit: limit // Limit the number of results to 20
      }
    ]);

    const totalDocuments = await post.countDocuments({sticky: { $ne: true } }); 
  // Get the total count of documents
    const size = Math.ceil(totalDocuments/limit)
    await post.populate(data,{
      path:'author',
        select: 'user_name profile_image'
    })

    await post.populate(data, {
      path: 'comment.author',
      select: 'user_name profile_image '
    });
    return res.json({ auth: true, data: data, size: size });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ auth: false, message: "Server error" });
  }
};


const getComment = async (req, res) => {
  try {
    const id = req.params?.id;
    const myid = req?.query?.myid ;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 15;
    const start = (page - 1) * limit;

    // Increment views
    await post.findOneAndUpdate(
      { _id: id },
      { $inc: { views: 1 } },
      { new: true }
    );

    // Fetch post with only required comments
    const data = await post.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      { $project: { comment: { $slice: ["$comment", start, limit] }, title: 1, image: 1, category: 1, author: 1, createdAt: 1, replyallow: 1, sticky:1 } }
    ]);

    if (!data || data.length === 0) {
      return res.json({ auth: false, message: "Post not found" });
    }

    const postData = data[0];
    const comm = postData.comment;

    // Populate references in the comments
    await post.populate(postData, [
      { path: 'author', select: 'user_name' },
      { path: 'comment.author', select: 'user_name profile_image rank createdAt mod supermod admin' },
      { path: 'comment.reply.author', select: 'user_name profile_image rank createdAt mod supermod admin' },
      { path: 'comment.reply.quoteid', select: 'user_name profile_image rank createdAt mod supermod admin' }
    ]);

    // Fetch user information if myid is provided
    let mydetail = null;
    if ( typeof myid !== undefined) {
      mydetail = await user.findById(myid).exec();
    } else {
      console.log('myid is either undefined or null');
    }
  
    const following = mydetail?.following || null;

    // Get total comment count
    const totalComments = await post.findOne({ _id: id }).select({ comment: 1 }).then(post => post.comment.length);
    const size = Math.ceil(totalComments / limit);

    const info = {
      _id: postData._id,
      title: postData.title,
      image: postData.image,
      category: postData.category,
      authorid: postData.author?._id,
      authorname: postData.author?.user_name || "User",
      createdAt: postData.createdAt,
      replyallow: postData.replyallow,
      sticky:postData.sticky,
      comment: comm,
    };

    return res.json({ auth: true, data: info, size, length: totalComments, following });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ auth: false, message: "Server error" });
  }
};

const pushUsers = async (req, res) => {
  try {
    const id = req.params.id;
    const name = await user.findOne({ _id: id });
    if (name.user_name == req.body.user_name) {
      await user.findByIdAndUpdate(
        { _id: id },
        {
          profile_image: req.body.profile_image,
          user_name: req.body.user_name,
        }
      );
      return res.json({ auth: true });
    } else {
      const usernam = await user.find({ user_name: req.body.user_name });
      if (usernam.length > 0) {
        return res.json({ auth: false, mgs: "Username Already Exist" });
      } else {
        await user.findByIdAndUpdate(
          { _id: id },
          {
            profile_image: req.body.profile_image,
            user_name: req.body.user_name,
          }
        );
        return res.json({ auth: true });
      }
    }
  } catch (e) {
    console.log(e);
  }
};

const commentthread = async (req, res) => {
  try {
    const ids = req?.params?.id;
    if (ids == "undefined") {
      return res.json({ auth: false, mgs:"No id"})
    }
    const body = req.body.value;
    const id = req.body.id;
    const reply = req?.body?.reply;
    const replyid = req?.body?.replyid;
    const data = await user.findOne({ _id: ids });
    if(data.ban)
      {
        return res.json({ auth: false, mgs:"Account Banned" ,ban:true})
      }
      if(data.suspend)
        {
          return res.json({ auth: false, mgs:"Account Suspended", suspend:true })
        }
    const postDocument = await post.findById({_id: id});
    if(!postDocument.replyallow)
    {return res.json({ auth: false , mgs:"Reply Not Allowed"});}
    if (data) {
      if (reply) {
       await post.findOneAndUpdate(
          {
            _id: id,
            "comment._id": replyid, // Ensures that the reply does not already exist
          },
          {
            $push: {
              "comment.$.reply": {
                comment: body,
                author: data._id,
                profile_image: data.profile_image,
                vote: 0,
                postid:postDocument._id,
                quote:req?.body?.quote,
                quoteid:req?.body?.quoteid._id,
                quotemgs:req?.body?.quotemgs
              },
            },
          },
          { new: true, timestamps: false }
        );

        const updatedPostDocument = await post.findById(id);
        const commentz = updatedPostDocument.comment.id(replyid);
        if (updatedPostDocument) {
          const newReply = commentz.reply[commentz.reply.length - 1]; // Get the last added reply
          const commentIndex = updatedPostDocument.comment.findIndex(c => c._id.equals(replyid));
          const replyIndex = commentz.reply.length - 1;
          const sequence = `${commentIndex + 1}.${replyIndex + 1}`;
          newReply.sequence = sequence;
          await updatedPostDocument.save();
          
          const updatedComment = updatedPostDocument.comment.find(
            (comment) => comment._id.toString() === replyid
          );
          const newReplys = updatedComment.reply[updatedComment.reply.length - 1];
          const newReplyId = newReplys._id;
          
if(data._id != req?.body?.quoteid._id)
{
        await user.updateOne(
          { _id: req?.body?.quoteid._id },
          {
              $push: { 'notification.notify':{
                message: `🔥 ${data.user_name} responded to a comment you made`,
                url: req?.body?.url,
                title: 'Comment Response',
                sender: data._id,
                sendername: data.user_name
            } },
              $set: { 'notification.alarm': true }
          }
      );
    }  
        return res.json({ auth: true , id:newReplyId});
  }
      } else {

    await post.findByIdAndUpdate(
          { _id: id },
          {
            $push: {
              comment: {
                comment: body,
                author: data._id,
                vote: 0,
                postid:postDocument._id
              },
            },
          },
          {
            timestamps: false, // Disable automatic timestamps
          }
        );
        const updatedPostDocument = await post.findById(id);
        if (updatedPostDocument) {
          // Get the last comment, which should be the one we just added
          const newComment = updatedPostDocument.comment[updatedPostDocument.comment.length - 1];
          if (newComment) {
            // Calculate the sequence
            const commentIndex =  updatedPostDocument.comment.length - 1;
            const sequence = `${commentIndex + 1}`;
          
            // Update the comment with the sequence
            newComment.sequence = sequence;
            await  updatedPostDocument.save();
          }
          const newCommentId = newComment._id;
       
    const newCommentCount = updatedPostDocument.comment.length;
    const pageNumber = Math.ceil(newCommentCount / 15);
    const Encode = (s) => {
      return s?.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, "") //remove diacritics
      .replace(/\s+/g, '-') //spaces to dashes
      .replace(/&/g, '-and-') //ampersand to and
      .replace(/[^\w\-]+/g, '') //remove non-words
      .replace(/\-\-+/g, '-') //collapse multiple dashes
      .replace(/^-+/, '') //trim starting dash
      .replace(/-+$/, '')
      .replace(/\//g, '-or-'); //trim ending dash
  }
    if ([2,5,10,15,20,30,40,50,70,100,,120,140,200,500,1000,2000,3000,10000,50000,100000].includes(newCommentCount) && data._id.toString() !== postDocument.author.toString()) {

      await user.updateOne(
        { _id: postDocument.authorid },
        {
          $push: {
            'notification.notify': {
              message: ` A new comment was made on your thread ...post ${newCommentCount}#`,
              url: `/${Encode(postDocument.category)}/${Encode(postDocument.title)}/${Encode(postDocument._id)}/${pageNumber}#post-${newCommentCount}`,
              title: 'Thread Response',
            },
          },
          $set: { 'notification.alarm': true },
        }
      );
    }

        return res.json({ auth: true, id:newCommentId });
      }}
    }
  } catch (e) {
    console.log(e);
  }
};

const createthread = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    const author = await user.findOne({ _id: id });
    if(author.ban)
    {
      return res.json({ auth: false,ban:true })
    }
    if(author.suspend)
      {
        return res.json({ auth: false,suspend:true })
      }

    if (author && (author.supermod || author.admin || data.category != "Forum Guides & Updates")) {
      const posts = await post.create({
        title: data.form.title,
        image: data.form.link,
        category: data.category,
        views: 0,
        sticky: false,
        replyallow: true,
        comment: {
          comment: data.value,
          author:id,
          vote: 0,
          sequence:"1",
        },
        author: id,
      });
      await posts.save();
      return res.json({ auth: true, message: "Theard Created" });
    }
  } catch (e) {
    console.log(e);
  }
};

const Like = async (req, res) => {
  
  try {
  const postId = req.params.postId;
  const userId = req.params.userId;
  const commentId = req.body.postId;
  const replys = req.body.reply;
  const { voteType, replyId } = req.body;
  const users = await user.findOne({ _id: userId });

  if (!users) {
    return res.status(404).json({ mgs: "User not found" });
  }
  if(users.ban)
    {
      return res.json({ auth: false,ban:true })
    }
    if(users.suspend)
      {
        return res.json({ auth: false,suspend:true })
      }
  const posts = await post.findById(postId);
  if (!posts) {
    return res.status(404).json({ mgs: "Post not found" });
  }
  const comment = posts.comment.id(commentId);
  if (!comment) {
    return res.status(404).json({ mgs: "Comment not found" });
  }
  if (replys) {
    const reply = comment.reply.id(replyId);
    if (!reply) {
      return res.status(404).json({ mgs: "Reply not found" });
    }

    // Check if the user has already upvoted or downvoted the reply
    const alreadyUpvoted = reply.upvotedBy.includes(userId);
    const alreadyDownvoted = reply.downvotedBy.includes(userId);

    if (voteType === "upvote") {
      if (alreadyUpvoted) {
        // Remove the upvote if the user clicks the upvote again
        reply.upvotedBy = reply.upvotedBy.filter(
          (id) => id.toString() !== userId
        );
        reply.vote -= 1;
      } else {
        if (alreadyDownvoted) {
          // Remove the downvote if the user has already downvoted
          reply.downvotedBy = reply.downvotedBy.filter(
            (id) => id.toString() !== userId
          );
          reply.vote += 1;
        }
        reply.vote += 1;
        reply.upvotedBy.push(userId);
      }
    } else if (voteType === "downvote") {
      if (alreadyDownvoted) {
        // Remove the downvote if the user clicks the downvote again
        reply.downvotedBy = reply.downvotedBy.filter(
          (id) => id.toString() !== userId
        );
        reply.vote += 1;
      } else {
        if (alreadyUpvoted) {
          // Remove the upvote if the user has already upvoted
          reply.upvotedBy = reply.upvotedBy.filter(
            (id) => id.toString() !== userId
          );
          reply.vote -= 1;
        }
        reply.vote -= 1;
        reply.downvotedBy.push(userId);
      }
    } else {
      return res.status(400).json({ mgs: "Invalid vote type" });
    }

    await posts.save();

    res.status(200).json({ mgs: "Vote registered" });
  } else {
    const alreadyUpvoted = comment.upvotedBy.includes(userId);
    const alreadyDownvoted = comment.downvotedBy.includes(userId);

    if (voteType === "upvote") {
      if (alreadyUpvoted) {
        comment.upvotedBy = comment.upvotedBy.filter(
          (id) => id.toString() !== userId
        );
        comment.vote -= 1;
      } else {
        if (alreadyDownvoted) {
          // Remove the downvote if the user has already downvoted
          comment.downvotedBy = comment.downvotedBy.filter(
            (id) => id.toString() !== userId
          );
          comment.vote += 1;
        }
        comment.vote += 1;
        comment.upvotedBy.push(userId);
      }
    } else if (voteType === "downvote") {
      if (alreadyDownvoted) {
        comment.downvotedBy = comment.downvotedBy.filter(
          (id) => id.toString() !== userId
        );
        comment.vote += 1;
      } else {
        if (alreadyUpvoted) {
          // Remove the upvote if the user has already upvoted
          comment.upvotedBy = comment.upvotedBy.filter(
            (id) => id.toString() !== userId
          );
          comment.vote -= 1;
        }
        comment.vote -= 1;
        comment.downvotedBy.push(userId);
      }
    } else {
      return res.status(400).json({ mgs: "Invalid vote type" });
    }

    await posts.save();

    res.status(200).json({ mgs: "Vote registered" });
  }}
  catch(e){
    console.log(e)
  }
};

const PushFollow = async (req, res) =>{
  try {
    const userId = req.params.id;
    const {postid, url } = req.body;
   
    const users = await user.findById(userId);
    if (!users) {
      return res.status(404).json({ error: 'User not found',auth:false });
    }
    const posts = await post.findById(postid);
    if (!posts) {
      return res.status(404).json({ error: 'Post not found',auth:false });
    }
    const newFollowing = {
      postid,
      url,
    };

    const existingIndex = users.following.findIndex(
      (follow) => follow.postid == postid
    );
    if (existingIndex !== -1) {
      // Item exists, remove it
      
      users.following.splice(existingIndex, 1);
      await users.save();
      return res.status(200).json({ message: 'Following removed successfully', auth: true });
    } else {
    users.following.push(newFollowing);
    await users.save();

    return res.status(200).json({ message: 'Following added successfully', auth:true});
    }
  } catch (error) {
    res.status(500).json({ error: 'An error occurred', details: error.message,auth:false });
  }
}

const PushBlock = async (req, res) =>{
  try {
    const userId = req.params.id;
    const { blockid } = req.body;
   if(blockid == userId)
   {
    return res.json({auth:false, error:"Can't block yourself"})
   }
    const users = await user.findById(userId);
    if (!users) {
      return res.status(404).json({ error: 'User not found',auth:false });
    }
    const block = await user.findById(blockid);
    if (!block) {
      return res.status(404).json({ error: 'Block user not found',auth:false });
    }
    const existingIndex = users.blocked.findIndex(
      (blok) => blok.userid == blockid
    );
    if (existingIndex !== -1) {
      // Item exists, remove it
      
      users.blocked.splice(existingIndex, 1);
      await users.save();
      return res.status(200).json({ message: ' unblocking successfully', auth: true });
    } else {
    users.blocked.push({userid:blockid});
    await users.save();

    return res.status(200).json({ message: 'Blocking successfully', auth:true});
    }
  } catch (error) {
    res.status(500).json({ error: 'An error occurred', details: error.message,auth:false });
  }
}

const RemoveFollow = async (req, res) => {
  try {
    const userId = req.params.id;
    const { postid } = req.body;
   
    // Find the user by ID
    const users = await user.findById(userId);
    if (!users) {
      return res.status(404).json({ error: 'User not found', auth: false });
    }

    // Check if the user is following the post
    const existingIndex = users.following.findIndex(
      (follow) => follow.postid == postid
    );
    if (existingIndex === -1) {
      // Item not found in the following list
      return res.status(404).json({ error: 'Follow item not found', auth: false });
    }

    // Remove the item
    users.following.splice(existingIndex, 1);
    await users.save();

    return res.status(200).json({ message: 'Following removed successfully', auth: true });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred', details: error.message, auth: false });
  }
}

const Edit = async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.params.userId;
    const { editbody, commentId, reply, replyId } = req.body;
    const posts = await post.findById(postId);

    if (!posts) {
      return res.status(404).json("Post not found");
    }

    const comment = posts.comment.id(commentId);
    if (!comment) {
      return res.status(404).json("Comment not found");
    }
    if (reply) {
      const reply = comment.reply.id(replyId);
      if (reply.author != userId) {
        res.status(200).json("Comment not updated");
        return;
      }
      reply.comment = editbody;
      await posts.save();

      res.status(200).json("Comment updated");
    } else {
      if (comment.author != userId) {
        res.status(200).json("Comment not updated");
        return;
      }

      comment.comment = editbody;
      await posts.save();

      res.status(200).json("Comment updated");
    }
  } catch (error) {
    res.status(500).json(error.message);
  }
};



const notify = async (req, res) => {
  try {
    const id = req.params.id;
    const data = await user.findOne({ _id: id });
    const notice = data.notification;
    if (notice.alarm) {
      await user.findByIdAndUpdate(
        { _id: id },
        {
          $set: {
            "notification.alarm": false,
          },
        }
      );
    }
    return res.json({ mgs: notice, auth: true });
  } catch (e) {
    console.log(e);
  }
};

const notification = async (req, res) => {
  try {
    const id = req.params.id;
    const data = await user.findOne({ _id: id }, { password: 0 });
    if(!data)
    {
      return res.json({ auth: false,mgs:"No user"})
    }
    if(data.ban)
    {
      return res.json({ auth: false,ban:true })
    }
    if (data) {
      const notice = data.notification;
      return res.json({
        mgs: notice,
        auth: true,
        data: { user_name: data.user_name, profile_image: data.profile_image },
        profile:{
          activated:data.activated,
          admin:data.admin,
          ban:data.ban,
          message:data.message,
          mod:data.mod,
          notification:data.notification,
          profile_image:data.profile_image,
          rank: data.rank,
          supermod:data.supermod,
          suspend:data.suspend,
          user_name:data.user_name,
          _id:data._id,
          following:data.following,
          blocked:data.blocked
        },
      });
    } else {
      return res.json({ auth: false });
    }
  } catch (e) {}
};

const changePass = async (req, res) => {
  try {
    const cpass = req.body.cpassword;
    const npass = req.body.npassword;
    const copass = req.body.copassword;
    const id = req.params.id;
    const info = await user.findOne({ _id: id });
    if (copass !== npass) {
      return res.json({
        mgs: "New Password and Comfirm Password dont match",
        auth: false,
      });
    }
    if (cpass == npass) {
      return res.json({
        mgs: "New Password and Current Password can't be the same",
        auth: false,
      });
    }

    const result = await bcrypt.compare(cpass, info.password);
    if (result) {
      const pass = req.body.npassword;
      const salt = await bcrypt.genSalt();
      const hash = await bcrypt.hash(pass, salt);
      await user.findByIdAndUpdate(
        { _id: id },
        {
          password: hash,
        }
      );

      return res.json({ auth: true });
    } else {
      res.json({ mgs: "Current Password Wrong", auth: false });
    }
  } catch (e) {
    console.log(e);
  }
};

const login = async (req, res) => {
  try {
    const emailinfo = req.body.email.toUpperCase();
    const info = await user.findOne({ email: emailinfo });
    if (info == null) {
      return res.json({ auth: false, message: "Email Not Found" });
    }
    const result = await bcrypt.compare(req.body.password, info.password);
    if (result) {
      if (!info?.group_access) {
        return res.json({ auth: false, message: "Please Verify Email First" });
      }
      if (info?.ban) {
        return res.json({ auth: false, message: "Your account has been banned" });
      }
      const id = info._id;
      const token = JWT.sign({ id }, process.env.JWTS);
      const userdata = {
        user_name: info.user_name,
        _id: info._id,
        admin: info.admin,
        group_access: info.group_access,
        profile_image: info.profile_image,
        rank: info.rank,
        mod: info.mod,
        supermod: info.supermod,
        following: info.following,
        suspend: info.suspend,
        ban: info.ban,
        activated: info.activated,
      };
      return res.json({ auth: true, token: token, data: userdata });
    } else {
      return res.json({ auth: false, message: "Password Wrong" });
    }
  } catch (e) {
    console.log(e);
  }
};

const getusePost = async (req, res) => {
  try {
  const id = req.params.id;
  const posts = await post.find({ author: id }).limit(10);;

  if(!posts)
  {
    return res.json({mgs:"post not found"})
  }
  await post.populate(posts,{
    path:'author',
      select: 'user_name profile_image'
  })
  return res.json({ mgs: "post sent", post: posts });
}catch(e)
{
  console.log(e)
}
};


const homemovie = async(req, res)=>{
  try{
  const id = req.params.id
  const lette = req.query.search
  const letter = lette.trim()
  if(letter == "")
  {
  
      return res.json({data:[],auth:true})
  }
 
      const result = await post.find({  author: id,  title:{'$regex':`${letter}`, $options: 'i'}}).limit(5)
      res.json({data:result, auth:true})
  }
  catch(e){
      console.log(e)

  }
}

const getUser = async (req, res) => {
  try {
    const id = req.params.id;
    const myid = req.params.myid
    // Fetch the user information
    const info = await user.findOne({ _id: id });
    if (!info) {
      return res.json({ auth: false });
    }
    const myinfo = await user.findOne({ _id: myid });
    if (!myinfo) {
      return res.json({ auth: false });
    }
    const result = {
      user_name: info.user_name,
      email: info.email,
      profile_image: info.profile_image,
      rank: info.rank,
      videos: info.videos,
      notification: info.notification.alarm,
      _id: info._id,
      suspend:info.suspend,
      ban:info.ban,
      admin:info.admin,
      supermod:info.supermod,
      blocked:myinfo.blocked,
      allowmgs:myinfo.allowmgs
    };

    return res.json({ data: result, auth: true });
  } catch (e) {
    console.log(e);
    res.json({ data:"error", auth: true });
    // Handle the error appropriately
  }
};

const getAdmin = async (req, res)=>{
  try{
    const query = req.query.cate
    let Data;
    const infoAdmin = await user.find({ admin: true }, { password: 0 });
    const infosmod = await user.find({ supermod: true }, { password: 0 });
    Data = {Admin:infoAdmin, Supemod:infosmod}
    if(query)
    {
      const infomod = await user.find({ "mod.body": true , "mod.category": query}, { password: 0 });
      Data = {Admin:infoAdmin, Supemod:infosmod, Mod:infomod}
    }
    const latestPost = await post.aggregate([
      { $unwind: '$comment' },
      { $unwind: { path: '$comment.reply', preserveNullAndEmptyArrays: true } },
      { 
        $project: {
          item: {
            $cond: {
              if: { $gt: ['$comment.reply.createdAt', '$comment.createdAt'] },
              then: '$comment.reply'
              ,
              else:  '$comment'
            }
          },
          category: 1
        }
      },
      { $sort: { 'item.createdAt': -1 } },
      { 
        $group: {
          _id: '$_id',
          items: { $push: '$item' },
          count: { $sum: 1 },
          category: { $first: '$category' }
        }
      },
      { 
        $match: {
          count: { $gt: 2 }
        }
      },
      { 
        $project: {
          _id: 1,
          category: 1,
          items: { $slice: ['$items', 2] }
        }
      },
      { $unwind: '$items' },
      { $replaceRoot: { newRoot: '$items' } }
    ]);
    
    await post.populate(latestPost,{
      path:'author',
        select: 'user_name profile_image'
    })

    await post.populate(latestPost, {
      path: 'postid',
      select: 'category title  profile_image'
    });
    
    Data.Latestpost = latestPost
    return res.json(Data)
  }
  catch(err){
    console.log(err)
  }
}
const passchange = async (req, res) => {
  try {
    const email = req.body.email.toUpperCase();
    const data = await user.findOne({ email: email });
    if (data) {
      if(data.ban){
        return res.json({
          auth: false,
          mgs: "Account Banned",
        });
      }
      const emailtoken = JWT.sign({ email }, process.env.CHAP, {
        expiresIn: "1h",
      });
      verifyEmail.verifyPass({
        userEmail: email,
        token: emailtoken,
      });
      return res.json({
        auth: true,
        mgs: "Password Change Link Sent To Your Email",
      });
    } else {
      return res.json({ auth: false, mgs: "Email Doesnt Exist" });
    }
  } catch (e) {
    console.log(e);
  }
};

const passwordchange = async (req, res) => {
  try {
    const token = req.body.token;
  const comfirmpassword = req.body.copassword;
  const password = req.body.npassword;
  if (comfirmpassword !== password) {
    return res.json({ auth: true, mgs: "Passwords Not the Same" });
  }
    const verifyWithJWTS = JWT.verify(token, process.env.CHAP);
    const data = await user.findOne({ email: verifyWithJWTS.email });
    const result = await bcrypt.compare(password, data.password);
    if (result) {
      return res.json({ auth: true, mgs: "Can't Change To Current Password" });
    }
    const salt = await bcrypt.genSalt();
    const hash = await bcrypt.hash(password, salt);
    await user.findOneAndUpdate(
      { email: verifyWithJWTS.email },
      {
        $set: {
          password: hash,
        },
      }
    );
    return res.json({ auth: true, mgs: "Password Changed" });
  } catch (e) {
    return res.json({ auth: true, mgs: "Link Authentication Failed" });
  }
};

const message = async (req, res) => {
  try {
    const userId = req.params.id;
    const { text, sender } = req.body;
    if(sender == userId)
    {
      return res.status(404).json({ mgs: 'Cannot message yourself ', auth:false });
    }
    const senderfile = await user.findOne({ _id: sender})
    if(!senderfile)
    {
      
      return res.json({auth:false})
    }
    if(senderfile.ban)
    {
      return res.status(404).json({ mgs: 'Account Banned', auth:false });
    }
    if(senderfile.suspend)
      {
        return res.status(404).json({ mgs: 'Account Suspened', auth:false });
      }


      const recipient = await user.findById(userId);
      if (!recipient) {
        return res.status(404).json({ mgs: 'User not found', auth: false });
      }
      
      if(!recipient?.allowmgs)
      {
        return res.status(404).json({ mgs: 'User not allowing messages', auth: false });
      }
      // Check if the sender is blocked by the recipient
      const isBlocked = recipient.blocked.some(blockedUser => blockedUser.userid == sender);
      if (isBlocked) {
        return res.status(403).json({ mgs: 'You are blocked by the recipient', auth: false });
      }
    const newMessage = {
      text,
      sender,
      sendername:senderfile.user_name,
      date: new Date()
    };
    const users = await user.findById(userId);
    if (users) {
      users.message.message.push(newMessage);
      users.message.alarm = true; // Set alarm to true when a new message is added
      await users.save();
      res.status(200).json({ mgs: 'Message Sent', auth:true});
    } else {
      res.status(404).json({ error: 'User not found', auth:false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' , auth:false });
  }
}

const mgsalarm = async (req, res) => {
  try {
    const id = req.params.id;
    const data = await user.findOne({ _id: id });
    const Mgs = data.message;
    if (Mgs.alarm) {
      await user.findByIdAndUpdate(
        { _id: id },
        {
          $set: {
            "message.alarm": false,
          },
        }
      );
    }
    return res.json({  auth: true });
  } catch (e) {
    console.log(e);
  }
};

cron.schedule('0 0 * * *', async () => {
  try {
    const users = await user.find({ 'message.alarm': false });
    const notuser = await user.find({ 'notification.alarm': false });

    users.forEach(async (user) => {
      user.message.message = user.message.message.filter(message => {
        return new Date() - new Date(message.date) <= 24 * 60 * 60 * 1000;
      });

      await user.save();
    });

    notuser.forEach(async (user) => {
      user.notification.notify = user.notification.notify.filter(message => {
        return new Date() - new Date(message.data) <= 24 * 60 * 60 * 1000;
      });

      await user.save();
    });

  } catch (error) {
    console.error('Error running cronjob:', error);
  }
});

const Getfollowed = async (req, res) => {
  try {
  const userid = req.params.id;
  const index = parseInt(req.params.index) || 1; // Get the index from query params, default to 1 if not provided

  
  const users = await user.findById(userid).select('following').lean();
  const postIds = users.following.map(follow => follow.postid);
  const posts = await post.find({ _id: { $in: postIds } }).select('-comment').lean();

    const itemsPerPage = 15;
    const totalSize = Math.ceil(posts.length / itemsPerPage); // Total number of items
    const startIndex = (index - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    // Ensure the slice is within bounds
    const followingSlice = posts.slice(startIndex, endIndex);

    await post.populate(followingSlice,{
      path:'author',
        select: 'user_name profile_image'
    })


    return res.json({ 
      totalSize: totalSize,
      currentPage: index,
      data: followingSlice 
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const LatestThreads = async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const limit = 15;
    const skip = (index - 1) * limit;

    const data = await post.aggregate([
      {
        $match: { sticky: { $ne: true } } // Exclude posts where sticky is true
      },
      {
        $sort: { createdAt: -1 } // Sort by creation date in descending order
      },
      {
        $addFields: {
          replycount: {
            $sum: [
              { $size: "$comment" },
              {
                $reduce: {
                  input: "$comment",
                  initialValue: 0,
                  in: { $add: ["$$value", { $size: "$$this.reply" }] },
                },
              },
            ],
          },
          comment: {
            $cond: {
              if: { $gt: [{ $size: "$comment" }, 1] },
              then: [
                { $arrayElemAt: ["$comment", 0] },
                {
                  $cond: {
                    if: {
                      $gt: [
                        {
                          $size: {
                            $arrayElemAt: [
                              "$comment.reply",
                              { $subtract: [{ $size: "$comment" }, 1] },
                            ],
                          },
                        },
                        0,
                      ],
                    },
                    then: {
                      $arrayElemAt: [
                        "$comment.reply",
                        {
                          $subtract: [
                            {
                              $size: {
                                $arrayElemAt: [
                                  "$comment.reply",
                                  { $subtract: [{ $size: "$comment" }, 1] },
                                ],
                              },
                            },
                            1,
                          ],
                        },
                      ],
                    },
                    else: {
                      $arrayElemAt: [
                        "$comment",
                        { $subtract: [{ $size: "$comment" }, 1] },
                      ],
                    },
                  },
                },
              ],
              else: "$comment",
            },
          },
        },
      },
      {
        $skip: skip // Skip to the appropriate index
      },
      {
        $limit: limit // Limit the number of results to 20
      }
    ]);

    const totalPosts = await post.countDocuments({ sticky: { $ne: true } });
     // Get the total count of documents
     await post.populate(data,{
      path:'author',
        select: 'user_name profile_image'
    })

    await post.populate(data, {
      path: 'comment.author',
      select: 'user_name profile_image '
    });

     const size = Math.ceil(totalPosts/limit)
    return res.json({ auth: true, data: data, size: size });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ auth: false, message: "Server error" });
  }
};



const deletePost = async (req, res) => {
  try {
    const id = req.params.id;
    const userid = req.params.userid;
    console.log(id + " " + userid)
    const postinfo = await post.findOne({ _id: id });
    if (!postinfo) {
      return res.status(404).json({ auth: false, message: 'Post not found.' });
    }
    const userinfo = await user.findOne({ _id: userid });
    if (!userinfo) {
      return res.status(404).json({ auth: false, message: 'user not found.' });
    }
    if (userinfo.supermod || userinfo.admin || userinfo.mod.category == postinfo.category)
      {
    const deletedPost = await post.findByIdAndDelete(id);
      
    if (deletedPost) {
      return res.json({ auth: true, message: "Post deleted successfully." });
    } else {
      return res.status(404).json({ auth: false, message: "Post not found." });
    }}
  } catch (e) {
    console.log(e);
    return res.status(500).json({ auth: false, message: "Server error." });
  }
};


const deleteComment = async (req, res) => {
  try {
    const postId = req.params.postId;
    const commentId = req.params.commentId;
    const userid = req.params.userid;

    // Find the post
    const postinfo = await post.findOne({ _id: postId });
    if (!postinfo) {
      return res.status(404).json({ auth: false, message: 'Post not found.' });
    }

    // Find the user
    const userinfo = await user.findOne({ _id: userid });
    if (!userinfo) {
      return res.status(404).json({ auth: false, message: 'User not found.' });
    }

    // Check user permissions
    if (userinfo.supermod || userinfo.admin || userinfo.mod.category == postinfo.category) {
      // Update the comment
      const updatedPost = await post.findOneAndUpdate(
        { _id: postId, "comment._id": commentId },
        {
          $set: {
            "comment.$.comment": "",         // Clear the comment content
            "comment.$.deleted": true         // Mark the comment as deleted
          }
        },
        { new: true }
      );

      if (updatedPost) {
        return res.json({ auth: true, message: "Comment deleted successfully." });
      } else {
        return res.status(404).json({ auth: false, message: "Comment not found." });
      }

    } else {
      return res.status(403).json({ auth: false, message: "Not authorized." });
    }

  } catch (e) {
    console.log(e);
    return res.status(500).json({ auth: false, message: "Server error." });
  }
};


const deleteReply = async (req, res) => {
  try {
    const postId = req.params.postId;
    const commentId = req.params.commentId;
    const replyId = req.params.replyId;
    const userid = req.params.userid;

    // Find the post
    const postinfo = await post.findOne({ _id: postId });
    if (!postinfo) {
      return res.status(404).json({ auth: false, message: 'Post not found.' });
    }

    // Find the user
    const userinfo = await user.findOne({ _id: userid });
    if (!userinfo) {
      return res.status(404).json({ auth: false, message: 'User not found.' });
    }

    // Check user permissions
    if (userinfo.supermod || userinfo.admin || userinfo.mod.category == postinfo.category) {
      // Update the reply
      const updatedPost = await post.findOneAndUpdate(
        { _id: postId, "comment._id": commentId, "comment.reply._id": replyId },
        {
          $set: {
            "comment.$[comment].reply.$[reply].comment": "", // Clear the reply content
            "comment.$[comment].reply.$[reply].deleted": true  // Mark the reply as deleted
          }
        },
        {
          arrayFilters: [
            { "comment._id": commentId },
            { "reply._id": replyId }
          ],
          new: true
        }
      );

      if (updatedPost) {
        return res.json({ auth: true, message: "Reply deleted successfully." });
      } else {
        return res.status(404).json({ auth: false, message: "Post, comment, or reply not found." });
      }

    } else {
      return res.status(403).json({ auth: false, message: "Not authorized." });
    }

  } catch (e) {
    console.log(e);
    return res.status(500).json({ auth: false, message: "Server error." });
  }
};


const Edippost =async(req, res)=>{
  try {
    const { id, userid } = req.params;
    const { title, image, sticky, replyallow, category } = req.body;
    const userinfo = await user.findOne({ _id: userid });
   
    if (!userinfo) {
      return res.status(404).json({ auth: false, message: 'User not found.' });
    }
    const postToEdit = await post.findById(id);
    if (!postToEdit) {
      return res.status(404).json({ message: 'Post not found' });
    }
 
    // Check if the user is the author of the post
    if ((String(userinfo._id) == String(postToEdit.authorid) || (userinfo.admin || userinfo.supermod ))) {
    // Update only the title and image fields
    postToEdit.title = title;
    postToEdit.image = image;
    if (userinfo.supermod || userinfo.admin || userinfo.mod.category == postToEdit.category)
    {
    postToEdit.sticky = sticky;
    postToEdit.replyallow = replyallow
    postToEdit.category = category
    }
    const updatedPost = await postToEdit.save();

    res.status(200).json({ message: 'Post updated successfully', auth: true, post: updatedPost });
  }
  else{
    return res.status(403).json({ auth: false, message: 'Unauthorized action' });
  }
  } catch (error) {
    res.status(500).json({ message: 'Error updating post', error });
  }
}

const updateUserStatus =async(req, res)=>{
  
  try {
  const { log, id } = req.params;
  const { action, checked } = req.body;

  
    if (log == id)
    {
      return res.status(404).json({ auth: false, message: 'Same User.' });
    }
    const userinfo = await user.findOne({ _id: id });
    if (!userinfo) {
      return res.status(404).json({ auth: false, message: 'User not found.' });
    }
    if(userinfo.admin || userinfo.supermod)
    {
    const update = {};
    if (action === 'suspend') {
      update.suspend = checked;
      update.suspendedAt = checked ? new Date() : null;
    } else if (action === 'ban') {
      update.ban = checked;
    }

  const users = await user.findOneAndUpdate({ _id: log }, update, { new: true
, useFindAndModify: false });


if (!users) {
  return res.status(404).json({ auth: false, message: 'User not found' });
}

res.status(200).json({ auth: true, message: `User ${action} status updated` });
    }
    else{
      res.status(200).json({ auth: false, message: `User not authorize` });
    }
} catch (error) {
console.error(error);
res.status(500).json({ auth: false, message: 'Server error' });
}

}

const updateMgs = async (req, res) => {
  try {
    const id = req.params.id;
    
    // Find the user by ID
    const userDoc = await user.findById(id);
    
    if (!userDoc) {
      return res.status(404).json({ auth: false, message: 'User not found' });
    }
    
    // Toggle the allowmgs field
    userDoc.allowmgs = !userDoc.allowmgs;
    
    // Save the updated document
    await userDoc.save();
    
    res.status(200).json({ auth: true, message: 'User updated successfully' });
  } catch (e) {
    console.log(e);
    res.status(500).json({ auth: false, message: 'Server error' });
  }
};

const searchPosts = async (searchTerm, searchTitle, searchIndex = 1) => {
  try {
    if (!searchTerm) {
      return res.status(400).send('Search term is required');
    }

    const searchRegex = new RegExp(searchTerm, 'i');
    const query = {
      $or: []
    };

    if (searchTitle === "title") {
      query.$or.push({ title: searchRegex });
    } else if (searchTitle === "body") {
      query.$or.push({ 'comment.comment': searchRegex });
      query.$or.push({ 'comment.reply.comment': searchRegex });
    } else {
      return { msg: "unknown", auth: false };
    }
    query.sticky = false;
    const posts = await post.find(query).exec();
    const commentsPerPage = 15;
    let totalComments = 0;

    // Filter results to include only exact matches
    const filteredPosts = posts.map((post) => {
      let exactComments = [];
      let exactReplies = [];
      const num = post.comment.length;
      const lastchat = post.comment[num - 1].comment;

      post.comment.forEach((c, commentIndex) => {
        totalComments++;
        const commentPosition = commentIndex + 1; // Comment position starts from 1
        const commentPage = Math.floor((totalComments - 1) / commentsPerPage) + 1;

        // Check if the comment matches the search regex
        if (searchRegex.test(c.comment)) {
          exactComments.push({
            comment: c.comment,
            position: commentPosition,
            page: commentPage,
            author:c.author
          });
        }

        // Loop through each reply in the comment
        c.reply.forEach((r, replyIndex) => {
          const replyPosition = `${commentPosition}.${replyIndex + 1}`; // Reply position starts from 1

          // Check if the reply matches the search regex
          if (searchRegex.test(r.comment)) {
            exactReplies.push({
              comment: r.comment,
              position: replyPosition,
              page: commentPage,
              author: r?.author
            });
          }
        });
      });

      return {
        title: post.title,
        category: post.category,
        _id: post._id,
        image: post.image,
        authorid: post.author,
        exactComments: exactComments,
        exactReplies: exactReplies,
        date: post.createdAt,
        type: searchTitle,
        lastchat,
        profile: post.profile,
        profileid: post.profileid,
        user: post.user
      };
    }).filter(post => post.exactComments.length > 0 || post.exactReplies.length > 0); // Filter out posts with no matches

    // Flatten the results to create individual objects for each exact comment and reply
    const splitResults = [];
    filteredPosts.forEach(post => {
      post.exactComments.forEach(comment => {
        splitResults.push({
          authorid: post.author,
          comment: comment.comment,
          image: post.image,
          position: comment.position,
          page: comment.page,
          author: comment.author,
          title: post.title,
          category: post.category,
          _id: post._id,
          date: post.date,
          type: post.type,
          lastchat: post.lastchat
        });
      });

      post.exactReplies.forEach(reply => {
        splitResults.push({
          authorid: post.author,
          comment: reply.comment,
          image: post.image,
          position: reply.position,
          page: reply.page,
          author: reply.author,
          title: post.title,
          category: post.category,
          _id: post._id,
          date: post.date,
          type: post.type,
          lastchat: post.lastchat
        });
      });
    });

    // Pagination logic
    const resultsPerPage = 10;
    const startIndex = (searchIndex - 1) * resultsPerPage;
    const endIndex = searchIndex * resultsPerPage;
    const paginatedResults = splitResults?.slice(startIndex, endIndex);
    await post.populate(paginatedResults,{
      path:'author',
        select: 'user_name profile_image'
    })

    await post.populate(paginatedResults, {
      path: 'comment.author',
      select: 'user_name profile_image '
    });

const totalsize = splitResults.length / resultsPerPage
const size = Math.ceil(totalsize) 
return { filteredPosts: paginatedResults, size:size };

  } catch (error) {
    console.error('Error searching posts:', error);
    throw error;
  }
};

const verifyemailtoken = async (req, res)=>{
  const token = req.params.token
  
  try{
      const verifyWithJWTS = JWT.verify(token, process.env.EMI);
       await user.findOneAndUpdate({email: verifyWithJWTS.email},{
          $set:{
            group_access: true,
          }
      })
      return res.json({auth:true, mgs:"Email verified"})
  }
  catch(e){
      return res.json({auth:true, mgs:"Authentication Error, Sign Up Again"})
  } 
 

} 

const Search = async(req, res)=>{
  try {
  const { query, title, index } = req.query;
  

    const results = await searchPosts(query, title, index);
    res.json(results);
  } catch (error) {
    console.error('Error searching posts:', error);
    res.status(500).send('Error searching posts');
  }
}


module.exports = {
  register,
  login,
  notification,
  createthread,
  Edit,
  getThreads,
  getComment,
  commentthread,
  Like,
  deleteReply,
  getUser,
  getusePost,
  getAdmin,
  pushUsers ,
  changePass,
  notify,
  message,
  mgsalarm ,
  metadata,
  PushFollow,
  Getfollowed,
  Toptheard,
  LatestThreads,
  deletePost,
  deleteComment,
  Edippost,
  updateUserStatus,
  Search,
  passchange,
verifyemailtoken,
passwordchange,
get,
homemovie,
RemoveFollow,
PushBlock,
updateMgs
};
