         
import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';

import { getPosts } from '../../actions/posts';
import Posts from '../Posts/Posts';
import Form from '../Form/Form';
import './style.css';

const Home = () => {
  const [currentId, setCurrentId] = useState(0);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(getPosts());
  }, [currentId, dispatch]);

  return (
    <div className="main-container">
            <div className="posts">
              <Posts />
            </div>
            <div className="form">
              <Form />
            </div>
          </div>
  );
};

export default Home;
