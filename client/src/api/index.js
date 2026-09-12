import axios from 'axios';



export const fetchPosts = () => axios.get('http://localhost:5000/posts');
export const createPost = (newPost) => axios.post('http://localhost:5000/posts', newPost);

export const deletePost = (id) => axios.delete(`http://localhost:5000/posts/${id}`);
