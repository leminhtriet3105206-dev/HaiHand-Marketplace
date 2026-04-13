import React from 'react';
import { useNavigate } from 'react-router-dom';

const PostAdFAB = () => {
  const navigate = useNavigate();

  
  const handlePostClick = () => {
    const user = localStorage.getItem('user');
    if (user) {
      navigate('/create-post');
    } else {
      alert("Vui lòng đăng nhập để đăng tin!");
      navigate('/login');
    }
  };

  return (
    <button 
      onClick={handlePostClick}
      title="Đăng tin ngay"
      style={{
      
        position: 'fixed',  
        bottom: '30px',        
        left: '50%',          
        transform: 'translateX(-50%)', 
        
       
        width: '65px',
        height: '65px',
        borderRadius: '50%',  
        backgroundColor: '#ff9800', 
        color: 'white',
        border: 'none',
        
       
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '40px',    
        fontWeight: 'bold',
        
        
        boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        zIndex: 1000,         
        transition: 'all 0.3s ease', 
      }}
      
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateX(-50%) scale(1.08)';
        e.currentTarget.style.backgroundColor = '#e68a00';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateX(-50%) scale(1)';
        e.currentTarget.style.backgroundColor = '#ff9800';
      }}
    >
      +
    </button>
  );
};

export default PostAdFAB;