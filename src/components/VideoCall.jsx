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
  // State management
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callStatus, setCallStatus] = useState("requesting-permission");
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const callDocRef = useRef(null);
  const callIdRef = useRef(initialCallId);
  const queuedCandidates = useRef([]);
  const isNegotiating = useRef(false); 
  const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";

  // Enhanced ICE server configuration with TURN
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { 
        urls: "turn:your-turn-server.com:3478",
        username: "your-username",
        credential: "your-credential" 
      }
    ],
    iceCandidatePoolSize: 10,
  };

  // Request media permissions
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

  // Process queued ICE candidates
  const processQueuedCandidates = async () => {
    while (queuedCandidates.current.length > 0) {
      const candidate = queuedCandidates.current.shift();
      try {
        await peerConnection.current.addIceCandidate(candidate);
        console.log("Added queued ICE candidate:", candidate.sdpMid, candidate.sdpMLineIndex);
      } catch (err) {
        console.error("Error adding queued ICE candidate:", err);
      }
    }
  };

  // Handle ICE candidates generated locally
  const handleICECandidate = (event) => {
    if (event.candidate && callDocRef.current && callIdRef.current) {
      const candidateCollection = collection(
        db,
        `artifacts/${appId}/public/data/calls/${callIdRef.current}/candidates`
      );
      const candidateDoc = doc(candidateCollection, `${Date.now()}`); 
      setDoc(candidateDoc, event.candidate.toJSON())
        .then(() => console.log("Sent ICE candidate:", event.candidate.sdpMid, event.candidate.sdpMLineIndex))
        .catch((err) => console.error("Error sending ICE candidate:", err));
    }
  };

  // Handle incoming remote media stream
  const handleTrack = (event) => {
    console.log("Remote track received:", event.streams[0]);
    setRemoteStream(event.streams[0]);
    setCallStatus("active");
  };

  // Handle renegotiation events
  const handleNegotiationNeeded = async () => {
    if (isInitiator && !isNegotiating.current && peerConnection.current.signalingState === 'stable') {
      isNegotiating.current = true;
      console.log("Negotiation needed. Attempting to create offer...");
      console.log(`Current signaling state: ${peerConnection.current.signalingState}`);
      
      try {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        console.log("Negotiation: Local offer set.");

        await updateDoc(callDocRef.current, {
          offer: {
            type: offer.type,
            sdp: offer.sdp,
          },
          updatedAt: new Date().toISOString(),
        });
        console.log("Negotiation: New offer sent to Firebase.");
      } catch (err) {
        console.error("Negotiation: Error creating/setting offer:", err);
        setError(`Negotiation failed: ${err.message || err.name}`);
      } finally {
        isNegotiating.current = false;
      }
    } else {
      console.log("Negotiation needed, but not initiating:", {
        isInitiator,
        isNegotiating: isNegotiating.current,
        signalingState: peerConnection.current.signalingState
      });
    }
  };

  // Improved answer handling
  const listenForAnswer = () => {
  const unsubscribe = onSnapshot(callDocRef.current, async (snapshot) => {
    const data = snapshot.data();
    if (data?.answer) {
      try {
        const pc = peerConnection.current;

        // 🔐 Final condition
        if (
          pc &&
          !pc.remoteDescription &&
          pc.signalingState === "have-local-offer"
        ) {
          console.log("Caller: Setting remote answer...");
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log("Caller: Remote answer set.");
          setCallStatus("active");
          await processQueuedCandidates();
        } else {
          console.warn("Caller: Not setting answer — invalid state or already set", {
            signalingState: pc?.signalingState,
            remoteDescription: pc?.remoteDescription,
          });
        }
      } catch (err) {
        console.error("Failed to set remote answer:", err);
        setError(`Failed to process answer: ${err.message || err.name}`);
        setCallStatus("failed");
      }
    }

    if (data?.status === "ended") {
      console.log("Call status changed to ended by remote peer.");
      endCall();
    }
  });

  return unsubscribe;
};


  // Listen for incoming ICE candidates from remote peer
  const listenForCandidates = () => {
    if (!callIdRef.current) {
      console.warn("Cannot listen for candidates: callIdRef.current is null.");
      return () => {};
    }

    const candidatesRef = collection(
      db,
      `artifacts/${appId}/public/data/calls/${callIdRef.current}/candidates`
    );

    const unsubscribe = onSnapshot(candidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          try {
            const candidate = new RTCIceCandidate(change.doc.data());
            console.log("Received remote ICE candidate:", candidate.sdpMid, candidate.sdpMLineIndex);

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
    return unsubscribe;
  };

  // Create a new call as the initiator
  const createCall = async () => {
    try {
      setCallStatus("creating-call");

      if (!callIdRef.current) {
        callIdRef.current = `call_${userId}_${peerId}_${Date.now()}`;
      }
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
      }, { merge: true });
      console.log("Call document created/updated in Firebase with ID:", callIdRef.current);

      if (peerConnection.current.signalingState === 'stable' && !isNegotiating.current) {
          isNegotiating.current = true;
          const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(offer);
          console.log("Caller: Initial Local description (offer) set.");

          await updateDoc(callDocRef.current, {
            offer: {
              type: offer.type,
              sdp: offer.sdp,
            },
            updatedAt: new Date().toISOString(),
          });
          console.log("Caller: Initial Offer sent to Firebase.");
      } else {
          console.warn("Caller: Not creating initial offer. Signaling state:", 
                      peerConnection.current.signalingState, 
                      "Is negotiating:", isNegotiating.current);
      }
      
      const unsubscribeAnswer = listenForAnswer();
      const unsubscribeCandidates = listenForCandidates();

      return [unsubscribeAnswer, unsubscribeCandidates];
    } catch (err) {
      console.error("Error creating call:", err);
      setError(`Failed to create call: ${err.message || err.name}`);
      setCallStatus("failed");
      return [];
    } finally {
        isNegotiating.current = false;
    }
  };

  // Answer an incoming call
  const answerCall = async () => {
    try {
      setCallStatus("answering-call");

      if (!initialCallId) {
        console.error("Cannot answer call: initialCallId is null.");
        setError("No call ID provided to answer.");
        setCallStatus("failed");
        return [];
      }

      callIdRef.current = initialCallId;
      callDocRef.current = doc(
        db,
        `artifacts/${appId}/public/data/calls`,
        callIdRef.current
      );

      const offerUnsubscribe = onSnapshot(callDocRef.current, async (snapshot) => {
        const data = snapshot.data();
        console.log("Receiver: onSnapshot triggered for offer. Data:", data);

        if (data?.offer && !peerConnection.current.currentRemoteDescription) {
          try {
            console.log("Receiver: Received offer from Firebase:", data.offer);
            console.log("Receiver: Signaling state before setting remote description (offer):", 
                       peerConnection.current.signalingState);

            if (
  peerConnection.current &&
  !peerConnection.current.remoteDescription &&
  peerConnection.current.signalingState === "stable"
) {
  await peerConnection.current.setRemoteDescription(
    new RTCSessionDescription(data.offer)
  );
  console.log("Receiver: Remote offer set.");
} else {
  console.warn("Receiver: Skipping setRemoteDescription (offer)", {
    signalingState: peerConnection.current?.signalingState,
    remoteDescription: peerConnection.current?.remoteDescription,
  });
}

            console.log("Receiver: Remote description (offer) set successfully.");

            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            console.log("Receiver: Local description (answer) set.");

            await updateDoc(callDocRef.current, {
              answer: {
                type: answer.type,
                sdp: answer.sdp,
              },
              status: "active",
              updatedAt: new Date().toISOString(),
            });
            console.log("Receiver: Answer sent to Firebase, call status active.");

            setCallStatus("active");
            await processQueuedCandidates();
          } catch (err) {
            console.error("Receiver ERROR: Failed to set remote description (offer) or create answer:", err);
            setError(`Failed to process offer: ${err.message || err.name}`);
            setCallStatus("failed");
          }
        }
        if (data?.status === "ended") {
          console.log("Call status changed to ended by remote peer.");
          endCall();
        }
      });

      const candidateUnsubscribe = listenForCandidates();

      return [offerUnsubscribe, candidateUnsubscribe];
    } catch (err) {
      console.error("Error answering call:", err);
      setError(`Failed to answer call: ${err.message || err.name}`);
      setCallStatus("failed");
      return [];
    }
  };

  // End the current call
  const endCall = async () => {
    try {
      setCallStatus("ending-call");

      if (callDocRef.current && callIdRef.current) {
        await updateDoc(callDocRef.current, {
          status: "ended",
          endedAt: new Date().toISOString(),
        });
        console.log("Call status updated to 'ended' in Firebase.");
      }
    } catch (err) {
      console.error("Error updating call status to ended in Firebase:", err);
    } finally {
      cleanupCall();
      onCallEnd();
    }
  };

  // Clean up resources
  const cleanupCall = () => {
    console.log("Cleaning up call resources...");
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      console.log("Local stream tracks stopped.");
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      console.log("Remote stream tracks stopped.");
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
      console.log("RTCPeerConnection closed.");
    }
    queuedCandidates.current = [];
    isNegotiating.current = false;
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus("idle");
    setError(null);
    setPermissionDenied(false);
    console.log("Call cleanup complete.");
  };

  // Initialize call setup
  useEffect(() => {
    let stream = null;
    let unsubscribeFunctions = [];

    const setupCall = async () => {
      try {
        stream = await requestMediaPermissions();

        if (stream) {
          peerConnection.current = new RTCPeerConnection(iceServers);

          // Add event listeners
          peerConnection.current.onnegotiationneeded = handleNegotiationNeeded;
          peerConnection.current.onicecandidate = handleICECandidate;
          peerConnection.current.ontrack = handleTrack;
          
          peerConnection.current.oniceconnectionstatechange = () => {
            const state = peerConnection.current.iceConnectionState;
            console.log("ICE connection state changed:", state);
            
            if (state === 'failed') {
              setError("ICE connection failed. Trying to recover...");
              // Could add reconnection logic here
            }
          };

          peerConnection.current.onconnectionstatechange = () => {
            const state = peerConnection.current.connectionState;
            console.log("Peer connection state changed:", state);
            
            if (state === 'failed') {
              setError("WebRTC connection failed. Trying to reconnect...");
              setTimeout(() => {
                if (peerConnection.current.connectionState === 'failed') {
                  endCall();
                }
              }, 2000);
            } else if (state === 'disconnected') {
              setError("WebRTC connection disconnected.");
            }
          };

          // Add local tracks
          stream.getTracks().forEach((track) => {
            peerConnection.current.addTrack(track, stream);
          });

          setCallStatus("setting-up-call");

          if (isInitiator) {
            unsubscribeFunctions = await createCall();
          } else {
            unsubscribeFunctions = await answerCall();
          }
        }
      } catch (err) {
        console.error("Error during overall call setup:", err);
        if (!permissionDenied) {
          setError(`Failed to set up call: ${err.message || err.name}`);
          setCallStatus("failed");
        }

        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        cleanupCall();
      }
    };

    setupCall();

    return () => {
      console.log("Running useEffect cleanup...");
      unsubscribeFunctions.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
      cleanupCall();
    };
  }, [isInitiator, initialCallId, userId, peerId, db, appId, onCallEnd]);

  // Update remote video when stream changes
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log("Remote video source object set.");
    }
  }, [remoteStream]);

  // UI
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
                      : "Connecting..."
                    }
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
              {callStatus === "setting-up-call" && <p>Setting up call...</p>}
              {callStatus === "creating-call" && <p>Calling...</p>}
              {callStatus === "answering-call" && <p>Answering...</p>}
              {callStatus === "ending-call" && <p>Ending call...</p>}
              {callStatus === "failed" && (
                <p className="error">
                  Call failed. {error && <span>{error}</span>}
                </p>
              )}
            </div>

            <div className="call-controls">
              <button onClick={endCall} className="end-call-button">
                End Call
              </button>
              {callStatus === "failed" && (
                <button 
                  onClick={() => window.location.reload()} 
                  className="retry-button"
                >
                  Retry Call
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCall;