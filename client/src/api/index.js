import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export const fetchPosts = () => axios.get(`${API_URL}/posts`);
export const createPost = (newPost) => axios.post(`${API_URL}/posts`, newPost);

export const deletePost = (id) => axios.delete(`${API_URL}/posts/${id}`);
