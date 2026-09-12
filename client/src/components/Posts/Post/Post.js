import React from 'react';
import './styles.css';
import moment from 'moment';
import {useDispatch} from 'react-redux';
import { deletePost } from '../../../actions/posts';



const Post = ({ post })=>{

  const dispatch = useDispatch();
    
    return (
      <div className="card">
        <div>
          <img
            src={post.selectedFile}
            alt="Placeholder"
            className="card-media"
          />
          <div className="title">{post.title}</div>
          
          <div className="card-content">{post.creator}</div>
          <div className="card-content">{moment(post.createdAt).fromNow()}</div>
        </div>
        
        <div>
            <div>{post.tags.map((tags) => `#${tags}`)}</div>
        </div>
        <div>{post.title}</div>
      <div>
        <div variant="body2" color="textSecondary" component="p">{post.message}</div>
      </div>
      <div >
        <button className='button' > Like  </button>
        <button className='button' onClick={() => dispatch(deletePost(post._id))} > Delete</button>
      </div>
      </div>
    );
};

export default Post;