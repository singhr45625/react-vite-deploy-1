import React, { useState, useEffect, useRef } from "react";
import { doc, setDoc, onSnapshot, updateDoc, collection } from "firebase/firestore";

const VideoCall = ({
  db,
  auth,
  userId,
  peerId,
  onCallEnd,
  initialCallId = null,
  isInitiator = false,
}) => {
  // State management (keeping your original state structure)
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callStatus, setCallStatus] = useState("requesting-permission");
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  // Refs (keeping your original ref structure)
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const callDocRef = useRef(null);
  const callIdRef = useRef(initialCallId);
  const queuedCandidates = useRef([]);
  const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";

  // ICE server configuration (keeping your original config)
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
  };

  // Request media permissions (keeping your original implementation)
  const requestMediaPermissions = async () => {
    try {
      setCallStatus("requesting-permission");
      setError(null);
      setPermissionDenied(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setCallStatus("permission-granted");
      return stream;
    } catch (err) {
      console.error("Error requesting media permissions:", err);
      
      if (err.name === "NotAllowedError") {
        setError("Please allow camera/microphone access to continue");
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        setError("Required hardware not found or not available");
      } else {
        setError("Error accessing media devices");
      }
      
      setCallStatus("permission-denied");
      setPermissionDenied(true);
      throw err;
    }
  };

  // Process queued ICE candidates (keeping your original implementation)
  const processQueuedCandidates = async () => {
    while (queuedCandidates.current.length > 0) {
      const candidate = queuedCandidates.current.shift();
      try {
        await peerConnection.current.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding queued ICE candidate:", err);
      }
    }
  };

  // Handle ICE candidates generated locally (keeping your original implementation)
  const handleICECandidate = (event) => {
    if (event.candidate && callDocRef.current) {
      const candidateCollection = collection(
        db,
        `artifacts/${appId}/public/data/calls/${callIdRef.current}/candidates`
      );
      const candidateDoc = doc(candidateCollection, `${Date.now()}`);
      setDoc(candidateDoc, event.candidate.toJSON());
    }
  };

  // Handle incoming remote media stream (keeping your original implementation)
  const handleTrack = (event) => {
    setRemoteStream(event.streams[0]);
    setCallStatus("active");
  };

  // Listen for answer from remote peer (keeping your original implementation)
  const listenForAnswer = () => {
    return onSnapshot(callDocRef.current, async (snapshot) => {
      const data = snapshot.data();
      if (data?.answer && !peerConnection.current.currentRemoteDescription) {
        try {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
          setCallStatus("active");
          await processQueuedCandidates();
        } catch (err) {
          console.error("Error setting answer:", err);
          setError("Failed to process answer");
          setCallStatus("failed");
        }
      }
      if (data?.status === "ended") {
        endCall();
      }
    });
  };

  // Listen for incoming ICE candidates from remote peer (keeping your original implementation)
  const listenForCandidates = () => {
    const candidatesRef = collection(
      db,
      `artifacts/${appId}/public/data/calls/${callIdRef.current}/candidates`
    );
    
    return onSnapshot(candidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          try {
            const candidate = new RTCIceCandidate(change.doc.data());
            if (peerConnection.current.remoteDescription) {
              peerConnection.current.addIceCandidate(candidate).catch(err => {
                console.error("Error adding ICE candidate:", err);
              });
            } else {
              console.log("Queueing ICE candidate - no remote description yet");
              queuedCandidates.current.push(candidate);
            }
          } catch (err) {
            console.error("Error creating ICE candidate:", err);
          }
        }
      });
    });
  };

  // Create a new call as the initiator (keeping your original implementation)
  const createCall = async () => {
    try {
      setCallStatus("creating-call");
      
      callIdRef.current = `call_${userId}_${peerId}_${Date.now()}`;
      callDocRef.current = doc(
        db,
        `artifacts/${appId}/public/data/calls`,
        callIdRef.current
      );

      await setDoc(callDocRef.current, {
        callerId: userId,
        calleeId: peerId,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      await updateDoc(callDocRef.current, {
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        updatedAt: new Date().toISOString(),
      });

      listenForAnswer();
      listenForCandidates();
    } catch (err) {
      console.error("Error creating call:", err);
      setError("Failed to create call");
      setCallStatus("failed");
    }
  };

  // Answer an incoming call (keeping your original implementation)
  const answerCall = async () => {
    try {
      setCallStatus("answering-call");
      
      callIdRef.current = initialCallId;
      callDocRef.current = doc(
        db,
        `artifacts/${appId}/public/data/calls`,
        callIdRef.current
      );

      const offerUnsubscribe = onSnapshot(callDocRef.current, async (snapshot) => {
        const data = snapshot.data();
        if (data?.offer && !peerConnection.current.currentRemoteDescription) {
          try {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(data.offer)
            );

            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);

            await updateDoc(callDocRef.current, {
              answer: {
                type: answer.type,
                sdp: answer.sdp,
              },
              status: "active",
              updatedAt: new Date().toISOString(),
            });

            setCallStatus("active");
            await processQueuedCandidates();
          } catch (err) {
            console.error("Error setting remote description:", err);
            setError("Failed to process offer");
            setCallStatus("failed");
          }
        }
      });

      const candidateUnsubscribe = listenForCandidates();

      return () => {
        offerUnsubscribe();
        candidateUnsubscribe();
      };
    } catch (err) {
      console.error("Error answering call:", err);
      setError("Failed to answer call");
      setCallStatus("failed");
    }
  };

  // End the current call (keeping your original implementation)
  const endCall = async () => {
    try {
      setCallStatus("ending-call");
      
      if (callDocRef.current) {
        await updateDoc(callDocRef.current, {
          status: "ended",
          endedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Error ending call:", err);
    } finally {
      cleanupCall();
      onCallEnd();
    }
  };

  // Clean up resources (keeping your original implementation)
  const cleanupCall = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    queuedCandidates.current = [];
  };

  // Initialize call setup (with minor improvements to error handling)
  useEffect(() => {
    let stream;
    let offerUnsubscribe;
    let candidateUnsubscribe;

    const setupCall = async () => {
      try {
        // 1. Request media permissions first
        stream = await requestMediaPermissions();
        
        // 2. Only proceed if we got permissions
        if (stream) {
          peerConnection.current = new RTCPeerConnection(iceServers);

          // Add tracks to peer connection
          stream.getTracks().forEach((track) => {
            peerConnection.current.addTrack(track, stream);
          });

          peerConnection.current.onicecandidate = handleICECandidate;
          peerConnection.current.ontrack = handleTrack;

          setCallStatus("setting-up-call");

          if (isInitiator) {
            await createCall();
          } else {
            const unsubs = await answerCall();
            if (unsubs) {
              offerUnsubscribe = unsubs.offerUnsubscribe;
              candidateUnsubscribe = unsubs.candidateUnsubscribe;
            }
          }
        }
      } catch (err) {
        console.error("Error setting up call:", err);
        if (!permissionDenied) {
          setError("Failed to set up call");
          setCallStatus("failed");
        }
        
        // Clean up if we got a stream but failed later
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
    };

    setupCall();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      if (offerUnsubscribe) offerUnsubscribe();
      if (candidateUnsubscribe) candidateUnsubscribe();
    };
  }, []);

  // Update remote video when stream changes (keeping your original implementation)
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // UI (keeping your original structure)
  return (
    <div className="video-call-modal">
      <div className="video-call-container">
        {permissionDenied ? (
          <div className="permission-denied">
            <h3>Permission Required</h3>
            <p>{error}</p>
            <div className="permission-buttons">
              <button 
                onClick={() => window.location.reload()}
                className="retry-button"
              >
                Try Again
              </button>
              <button onClick={onCallEnd} className="cancel-button">
                Cancel Call
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="video-grid">
              <div className="video-container">
                {localStream ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="video-element"
                  />
                ) : (
                  <div className="status-message">
                    {callStatus === "requesting-permission" 
                      ? "Requesting camera/microphone access..." 
                      : callStatus === "setting-up-call"
                      ? "Setting up your camera..."
                      : callStatus === "creating-call"
                      ? "Creating call..."
                      : callStatus === "answering-call"
                      ? "Answering call..."
                      : "Loading..."}
                  </div>
                )}
                <div className="video-label">You</div>
              </div>
              <div className="video-container">
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="video-element"
                  />
                ) : (
                  <div className="status-message">
                    {callStatus === "active" 
                      ? "Waiting for remote stream..." 
                      : "Connecting to peer..."}
                  </div>
                )}
                <div className="video-label">Remote</div>
              </div>
            </div>

            <div className="call-status">
              {callStatus === "active" && <p>Call in progress</p>}
              {error && <p className="error">{error}</p>}
            </div>

            <div className="call-controls">
              <button onClick={endCall} className="end-call-button">
                End Call
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCall;