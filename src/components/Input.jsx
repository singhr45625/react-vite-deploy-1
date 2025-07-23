import React, { useContext, useState, useRef } from "react";
import Img from "../img/img.png";
import Attach from "../img/attach.png";
import { AuthContext } from "../context/AuthContext";
import { ChatContext } from "../context/ChatContext";
import {
  arrayUnion,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db, storage } from "../firebase";
import { v4 as uuid } from "uuid";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

const Input = () => {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const { currentUser } = useContext(AuthContext);
  const { data } = useContext(ChatContext);

  const handleSend = async () => {
    if (!text.trim() && !img) return;

    setIsUploading(true);
    
    try {
      if (img) {
        // Validate file
        if (!img.type.startsWith('image/')) {
          alert('Please upload an image file');
          setIsUploading(false);
          return;
        }

        const storageRef = ref(storage, `chat_images/${uuid()}`);
        const uploadTask = uploadBytesResumable(storageRef, img);

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => {
            console.error("Upload error:", error);
            setIsUploading(false);
          },
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            await updateMessages(downloadURL);
            setIsUploading(false);
            setUploadProgress(0);
          }
        );
      } else {
        await updateMessages();
        setIsUploading(false);
      }

      setText("");
      setImg(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset file input
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setIsUploading(false);
    }
  };

  const updateMessages = async (imgUrl = null) => {
    const messageData = {
      id: uuid(),
      text,
      senderId: currentUser.uid,
      date: Timestamp.now(),
      ...(imgUrl && { img: imgUrl }),
    };

    await updateDoc(doc(db, "chats", data.chatId), {
      messages: arrayUnion(messageData),
    });

    await updateLastMessage();
  };

  const updateLastMessage = async () => {
    const lastMessage = {
      text: text || (img ? "📷 Photo" : ""),
    };

    const updates = {
      [data.chatId + ".lastMessage"]: lastMessage,
      [data.chatId + ".date"]: serverTimestamp(),
    };

    await Promise.all([
      updateDoc(doc(db, "userChats", currentUser.uid), updates),
      updateDoc(doc(db, "userChats", data.user.uid), updates),
    ]);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isUploading) handleSend();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImg(e.target.files[0]);
    }
  };

  return (
    <div className="input">
      <input
        type="text"
        placeholder="Type something..."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        value={text}
        disabled={isUploading}
      />
      <div className="send">
        <img src={Attach} alt="Attach file" />
        <input
          type="file"
          style={{ display: "none" }}
          id="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          disabled={isUploading}
        />
        <label htmlFor="file">
          <img src={Img} alt="Send image" />
        </label>
        <button onClick={handleSend} disabled={isUploading || (!text && !img)}>
          {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : "Send"}
        </button>
      </div>
    </div>
  );
};

export default Input;