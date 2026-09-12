import React, { useEffect }from 'react';
import Post from './Post/Post.js';
import { useSelector, useDispatch } from 'react-redux';
import './styles.css';
import { getPosts } from '../../actions/posts.js';





const Posts = ({ setCurrentId }) => {
    const dispatch = useDispatch();
    const posts = useSelector((state) => state.posts.postMessages);

    useEffect(() => {
        dispatch(getPosts()); // Dispatch action to fetch posts when component mounts
    }, [dispatch]); // Dependency array to ensure dispatch is called only once on mount

    console.log(posts);



    if (!posts) {
        return <div>Loading...</div>; // Render loading indicator while fetching data
    }

    return (
        <div className="posts-container">
            {posts.length === 0 ? (
                <div>No posts found.</div>
            ) : (
                posts.map((post) => (
                    <div key={post._id}>
                        <Post post={post} setCurrentId={setCurrentId} />
                    </div>
                ))
            )}
        </div>
    );
};

export default Posts;