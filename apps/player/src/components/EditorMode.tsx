import React from "react";
import { OptionalElement } from "./OptionalElement";

export const EditorMode = () => {
  return (
    <OptionalElement className="absolute top-[1rem] right-4 z-100">
      <div className="relative origin-top-right group">
        <div className="bg-black/60 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30 px-2 flex items-center gap-1 p-2">Editor Mode</div>
        <div className="absolute right-0 top-full mt-2 hidden group-hover:block">
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/30 p-3 text-sm text-white/90 shadow-xl min-w-[200px] w-[400px]">
            <div className="font-medium mb-2">Shortcuts</div>
            <div className="space-y-3">
              <div className="flex justify-between space-x-2">
                <span>Edit</span>
                <span className="text-white/70">
                  <span className="w-5 h-5 bg-gray-500 p-1 shadow-[2px_2px_white] mr-1 rounded-xs">⌘</span> + click (on text)
                </span>
              </div>
              <div className="flex justify-between space-x-2">
                <span>Remove Character</span>
                <span className="text-white/70">
                  <span className="w-5 h-5 bg-gray-500 p-1 shadow-[2px_2px_white] mr-1 rounded-xs">⌘</span> + click (on character)
                </span>
              </div>
              <div className="flex justify-between space-x-2">
                <span>Add Character</span>
                <span className="text-white/70">
                  <span className="w-5 h-5 bg-gray-500 p-1 shadow-[2px_2px_white] mr-1 rounded-xs">⌥</span> + select text
                </span>
              </div>
              <div className="flex justify-between space-x-2">
                <span>Add Music Suggestion</span>
                <span className="text-white/70">
                  <span className="w-5 h-5 bg-gray-500 p-1 shadow-[2px_2px_white] mr-1 rounded-xs">M</span> + click (on text)
                </span>
              </div>
              <div className="flex justify-between space-x-2">
                <span>Remove Music Suggestion</span>
                <span className="text-white/70">
                  <span className="w-5 h-5 bg-gray-500 p-1 shadow-[2px_2px_white] mr-1 rounded-xs">M</span> + click (on ♪)
                </span>
              </div>
              <div className="flex justify-between space-x-2">
                <span>Add Background Suggestion</span>
                <span className="text-white/70">
                  <span className="w-5 h-5 bg-gray-500 p-1 shadow-[2px_2px_white] mr-1 rounded-xs">B</span> + click (on text)
                </span>
              </div>
              <div className="flex justify-between space-x-2">
                <span>Remove Background Suggestion</span>
                <span className="text-white/70">
                  <span className="w-5 h-5 bg-gray-500 p-1 shadow-[2px_2px_white] mr-1 rounded-xs">B</span> + click (on 🖼️)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </OptionalElement>
  );
};
