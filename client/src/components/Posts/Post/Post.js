import React from 'react';
import './styles.css';
import moment from 'moment';
import { useDispatch } from 'react-redux';
import { deletePost } from '../../../actions/posts';

const Post = ({ post }) => {
  const dispatch = useDispatch();

  const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];

  return (
    <div className="card">
      <div>
        {post.selectedFile ? (
          <img
            src={post.selectedFile}
            alt={post.title || 'Post image'}
            className="card-media"
          />
        ) : (
          <div className="card-media card-media-empty">No image</div>
        )}
        <div className="title">{post.title || 'Untitled'}</div>

        <div className="card-content">{post.creator || 'Unknown creator'}</div>
        <div className="card-content">{moment(post.createdAt).fromNow()}</div>
      </div>

      <div>
        <div>{tags.map((tag) => `#${tag}`).join(' ')}</div>
      </div>
      <div>
        <div className="card-content">{post.message}</div>
      </div>
      <div>
        <button className="button">Like</button>
        <button className="button" onClick={() => dispatch(deletePost(post._id))}>Delete</button>
      </div>
    </div>
  );
};

export default Post;
