import React from 'react';
import './style.css';
import { Link } from 'react-router-dom';

const navbar = ()=>{
    const user= null;
    return (
      <>
        <div className="nav">
          <h3 className="capashio">Capashio</h3>
          <h4 >Friends</h4>
          {user ? (
            <>
              <h4 >Your Account</h4>
              <h4 >Logout</h4>
            </>
          ) : (
            <Link to="/auth">
            <h4>Login</h4>
          </Link>
          )}
        </div>
      </>
    );
}

export default navbar;