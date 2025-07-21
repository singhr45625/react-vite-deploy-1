import { doc, onSnapshot } from "firebase/firestore";
import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase";

const Chats = () => {
  const [chats, setChats] = useState([]);

  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    const getChats = () => {
      if (!currentUser || !currentUser.uid) {
        console.log("No current user UID available to fetch chats.");
        return;
      }

      const unsub = onSnapshot(doc(db, "userChats", currentUser.uid), (docSnapshot) => {
        if (docSnapshot.exists()) {
          setChats(docSnapshot.data());
        } else {
          setChats({});
        }
      }, (error) => {
        console.error("Error fetching user chats:", error);
      });

      return () => {
        unsub();
      };
    };

    currentUser.uid && getChats();
  }, [currentUser.uid, db]);

  const handleSelect = (u) => {
    dispatch({ type: "CHANGE_USER", payload: u });
  };

  return (
    <div className="chats">
      {Object.entries(chats)?.sort((a,b)=>b[1].date - a[1].date).map((chat) => (
        <div
          className="userChat p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 rounded-lg transition-colors duration-200"
          key={chat[0]}
          onClick={() => handleSelect(chat[1].userInfo)}
        >
          <img
            src={chat[1].userInfo.photoURL}
            alt=""
            className="w-12 h-12 rounded-full object-cover border-2 border-blue-400 flex-shrink-0"
          />
          <div className="userChatInfo flex flex-col overflow-hidden">
            <span className="font-semibold text-gray-800 text-lg truncate">
              {chat[1].userInfo.displayName}
            </span>
            <p className="text-gray-600 text-sm truncate">
              {chat[1].lastMessage?.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Chats;