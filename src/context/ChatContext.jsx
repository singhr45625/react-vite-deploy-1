import React, {
  createContext,
  useContext,
  useReducer,
} from "react";
import { AuthContext } from "./AuthContext"; // Ensure correct path

export const ChatContext = createContext();

export const ChatContextProvider = ({ children }) => {
  const { currentUser } = useContext(AuthContext); // Get currentUser from AuthContext

  const INITIAL_STATE = {
    chatId: "null",
    user: {}, // This 'user' will be the peer you are chatting with
  };

  const chatReducer = (state, action) => {
    switch (action.type) {
      case "CHANGE_USER":
        // Ensure currentUser and action.payload.uid exist before concatenating
        if (currentUser && currentUser.uid && action.payload && action.payload.uid) {
          return {
            user: action.payload,
            chatId:
              currentUser.uid > action.payload.uid
                ? currentUser.uid + action.payload.uid
                : action.payload.uid + currentUser.uid,
          };
        }
        return state; // Return current state if data is incomplete

      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE);

  return (
    <ChatContext.Provider value={{ data: state, dispatch }}>
      {children}
    </ChatContext.Provider>
  );
};