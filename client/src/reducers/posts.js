const initialState = { postMessages: [] };

const postsReducer = (posts = initialState, action) => {
    const current = Array.isArray(posts.postMessages) ? posts.postMessages : [];

    switch (action.type) {
        case 'FETCH_ALL':
            return action.payload;

        case 'CREATE':
            return { ...posts, postMessages: [...current, action.payload] };

        case 'DELETE':
            return { ...posts, postMessages: current.filter((post) => post._id !== action.payload) };

        default:
            return posts;
    }
};

export default postsReducer;
