import React, { useContext, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { arrayRemove, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "../firebase";
import { ref, deleteObject } from "firebase/storage";

const Message = ({ message }) => {
  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);
  const ref = useRef();

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this message?")) return;

    try {
      // Delete image from storage if message has an image
      if (message.img) {
        try {
          const imageRef = ref(storage, message.img);
          await deleteObject(imageRef);
        } catch (error) {
          console.log("Image might already be deleted", error);
        }
      }

      // Remove message from Firestore
      const chatRef = doc(db, "chats", data.chatId);
      await updateDoc(chatRef, {
        messages: arrayRemove(message)
      });

      // Update last message if this was the last message
      await updateLastMessage();
    } catch (error) {
      console.error("Error deleting message:", error);
      alert("Failed to delete message");
    }
  };

  const updateLastMessage = async () => {
    const chatRef = doc(db, "chats", data.chatId);
    const chatDoc = await getDoc(chatRef);
    const messages = chatDoc.exists() ? chatDoc.data().messages : [];
    
    const newLastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    const lastMessageData = {
      text: newLastMessage?.text || (newLastMessage?.img ? "📷 Photo" : ""),
      date: newLastMessage?.date || serverTimestamp()
    };

    // Update both users' chat records
    await Promise.all([
      updateDoc(doc(db, "userChats", currentUser.uid), {
        [data.chatId + ".lastMessage"]: lastMessageData,
        [data.chatId + ".date"]: lastMessageData.date
      }),
      updateDoc(doc(db, "userChats", data.user.uid), {
        [data.chatId + ".lastMessage"]: lastMessageData,
        [data.chatId + ".date"]: lastMessageData.date
      })
    ]);
  };

  return (
    <div
      ref={ref}
      className={`message ${message.senderId === currentUser.uid ? "owner" : ""}`}
    >
      <div className="messageInfo">
        <img
          src={
            message.senderId === currentUser.uid
              ? currentUser.photoURL
              : data.user.photoURL
          }
          alt=""
        />
        <span>just now</span>
      </div>
      <div className="messageContent">
        <p>{message.text}</p>
        {message.img && <img src={message.img} alt="" />}
        {message.senderId === currentUser.uid && (
          <button 
            className="delete-btn"
            onClick={handleDelete}
            title="Delete message"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
};

export default Message;