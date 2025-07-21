import React from "react";
import Navbar from "./Navbar";
import Search from "./Search";
import Chats from "./Chats";

const Sidebar = () => {
  return (
    <div className="sidebar flex flex-col h-full">
      <Navbar />
      <Search />
      <div className="chats-container flex-1 overflow-y-auto">
        <Chats />
      </div>
    </div>
  );
};

export default Sidebar;