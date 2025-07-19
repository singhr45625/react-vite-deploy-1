// Chat.js
import React, { useContext, useState, useEffect, useRef } from "react";
import Cam from "../img/cam.png";
import Add from "../img/add.png";
import More from "../img/more.png";
import Messages from "./Messages";
import Input from "./Input";
import { ChatContext } from "../context/ChatContext";
import { AuthContext } from "../context/AuthContext";
import VideoCall from "./VideoCall";
import { doc, onSnapshot, collection, query, where, updateDoc } from "firebase/firestore";
import "./VideoCall.css";

const Chat = () => {
  const { data } = useContext(ChatContext);
  const { db, userId, auth } = useContext(AuthContext);

  const [showVideoCall, setShowVideoCall] = useState(false);
  const [callData, setCallData] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);

  const activeCallIdRef = useRef(null);
  const isPromptActiveRef = useRef(false);
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

  useEffect(() => {
    if (!db || !userId || !data.user?.uid) return;

    const callsCollectionRef = collection(db, `artifacts/${appId}/public/data/calls`);

    // Listen for incoming calls where current user is the callee
    const q = query(
      callsCollectionRef,
      where('calleeId', '==', userId),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const callData = change.doc.data();
        const callId = change.doc.id;

        if (change.type === 'added' && 
            data.user?.uid === callData.callerId && 
            activeCallIdRef.current !== callId && 
            !isPromptActiveRef.current) {
          
          activeCallIdRef.current = callId;
          isPromptActiveRef.current = true;

          const acceptCall = window.confirm(
            `Incoming video call from ${data.user.displayName || 'User'}! Accept?`
          );

          if (acceptCall) {
            setCallData({
              callId,
              callerId: callData.callerId,
              calleeId: callData.calleeId,
              offer: callData.offer
            });
            setShowVideoCall(true);
            setIsInitiator(false);
            
            // Update call status to accepted
            updateDoc(doc(db, `artifacts/${appId}/public/data/calls`, callId), { 
              status: 'accepted' 
            });
          } else {
            // Update call status to rejected
            updateDoc(doc(db, `artifacts/${appId}/public/data/calls`, callId), { 
              status: 'rejected',
              endedAt: new Date().toISOString()
            });
          }
          
          activeCallIdRef.current = null;
          isPromptActiveRef.current = false;
        }
      });
    });

    return () => {
      unsubscribe();
      activeCallIdRef.current = null;
      isPromptActiveRef.current = false;
    };
  }, [db, userId, data.user?.uid]);

  const handleStartCall = () => {
    if (!data.user?.uid) {
      alert('Please select a user to call');
      return;
    }
    
    if (showVideoCall) {
      alert('A call is already active');
      return;
    }

    setCallData({
      callId: null,
      callerId: userId,
      calleeId: data.user.uid
    });
    setShowVideoCall(true);
    setIsInitiator(true);
    activeCallIdRef.current = null;
  };

  const handleCallEnd = () => {
    setShowVideoCall(false);
    setCallData(null);
    activeCallIdRef.current = null;
  };

  if (!data.user?.uid) {
    return (
      <div className="flex-grow flex items-center justify-center text-gray-500">
        Select a chat to start messaging or a video call.
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chatInfo">
        <span>{data.user?.displayName}</span>
        <div className="chatIcons">
          <img
            src={Cam}
            alt="Video Call"
            onClick={handleStartCall}
            style={{ cursor: 'pointer' }}
            title="Start Video Call"
          />
          <img src={Add} alt="" />
          <img src={More} alt="" />
        </div>
      </div>
      <Messages />
      <Input />

      {showVideoCall && callData && (
        <VideoCall
          db={db}
          auth={auth}
          userId={userId}
          peerId={data.user.uid}
          onCallEnd={handleCallEnd}
          initialCallId={!isInitiator ? callData.callId : null}
          isInitiator={isInitiator}
        />
      )}
    </div>
  );
};

export default Chat;