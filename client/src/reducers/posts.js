const postsReducer = (posts = [] , action) => {
    switch (action.type) {
        case 'FETCH_ALL':
            return action.payload;

        case 'CREATE':
            return{
                ...posts,
                postMessages: [...posts.postMessages, action.payload]
            }
        case 'DELETE':
            return {...posts,
                postMessages: posts.postMessages.filter((post) => post._id !== action.payload)
            }
            
        default:
            return posts;
    }
};

export default postsReducer;