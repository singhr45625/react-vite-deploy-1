import { doc, onSnapshot } from "firebase/firestore";
import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import { db } from "../firebase"; // Assuming 'db' is imported from your firebase config

const Chats = () => {
  const [chats, setChats] = useState([]);

  const { currentUser } = useContext(AuthContext);
  const { dispatch } = useContext(ChatContext);

  useEffect(() => {
    const getChats = () => {
      // Ensure currentUser.uid exists before attempting to fetch chats
      if (!currentUser || !currentUser.uid) {
        console.log("No current user UID available to fetch chats.");
        return;
      }

      const unsub = onSnapshot(doc(db, "userChats", currentUser.uid), (docSnapshot) => {
        if (docSnapshot.exists()) {
          setChats(docSnapshot.data());
        } else {
          setChats({}); // Set to empty object if no chats document exists
        }
      }, (error) => {
        console.error("Error fetching user chats:", error);
      });

      return () => {
        unsub();
      };
    };

    currentUser.uid && getChats();
  }, [currentUser.uid, db]); // Added db to dependency array as it's used in getChats

  const handleSelect = (u) => {
    dispatch({ type: "CHANGE_USER", payload: u });
  };

  return (
    <div className="chats">
      {Object.entries(chats)?.sort((a,b)=>b[1].date - a[1].date).map((chat) => (
        <div
          className="userChat p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 rounded-lg transition-colors duration-200" // Added Tailwind classes for spacing, alignment, and hover effect
          key={chat[0]}
          onClick={() => handleSelect(chat[1].userInfo)}
        >
          <img
            src={chat[1].userInfo.photoURL}
            alt=""
            className="w-12 h-12 rounded-full object-cover border-2 border-blue-400 flex-shrink-0" // Fixed size, rounded, object-cover, and border
          />
          <div className="userChatInfo flex flex-col overflow-hidden"> {/* Use flex-col for stacked text, overflow-hidden */}
            <span className="font-semibold text-gray-800 text-lg truncate"> {/* truncate for long names */}
              {chat[1].userInfo.displayName}
            </span>
            <p className="text-gray-600 text-sm truncate"> {/* truncate for long messages */}
              {chat[1].lastMessage?.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Chats;