import React, { useState } from "react";
import "./styles.css";
import FileBase from "react-file-base64";
import { useDispatch } from "react-redux";
import { createPost } from "../../actions/posts";

const emptyPost = {
  creator: "",
  title: "",
  message: "",
  tags: "",
  selectedFile: "",
};

const Form = () => {
  const [postData, setPostData] = useState(emptyPost);

  const dispatch = useDispatch();

  const clear = () => setPostData(emptyPost);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!postData.title.trim() && !postData.message.trim()) {
      alert("Add a title or a message before you submit.");
      return;
    }

    dispatch(
      createPost({
        ...postData,
        tags: postData.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      })
    );

    clear();
  };

  return (
    <div className="form-container">
      <form autoComplete="off" noValidate onSubmit={handleSubmit}>
        <h6>Creating a memory</h6>
        <div>
          <label htmlFor="creator">Creator</label>
          <input
            type="text"
            id="creator"
            name="creator"
            value={postData.creator}
            onChange={(e) =>
              setPostData({ ...postData, creator: e.target.value })
            }
          />
        </div>
        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            value={postData.title}
            onChange={(e) =>
              setPostData({ ...postData, title: e.target.value })
            }
          />
        </div>
        <div className="form-group">
          <label htmlFor="message">Message</label>
          <input
            type="text"
            id="message"
            name="message"
            value={postData.message}
            onChange={(e) =>
              setPostData({ ...postData, message: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label htmlFor="tags">Tags</label>
          <input
            type="text"
            id="tags"
            name="tags"
            placeholder="Separate tags with a comma"
            value={postData.tags}
            onChange={(e) => setPostData({ ...postData, tags: e.target.value })}
          />
        </div>
        <div>
          <FileBase
            type="file"
            multiple={false}
            onDone={({ base64 }) =>
              setPostData({ ...postData, selectedFile: base64 })
            }
          />
        </div>
        <button className="button1" type="submit">Submit</button>
        <button className="button1" type="button" onClick={clear}>Clear</button>
      </form>
    </div>
  );
};

export default Form;
