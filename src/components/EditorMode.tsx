import React from "react";

export const EditorMode = () => {
  return (
    <div className="absolute top-[1rem] right-4 z-100 optional-element">
      <div className="relative origin-top-right group">
        <div className="bg-black/60 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30 px-2 flex items-center gap-1 p-2">Editor Mode</div>
        <div className="absolute right-0 top-full mt-2 hidden group-hover:block">
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/30 p-3 text-sm text-white/90 shadow-xl min-w-[200px] w-[300px]">
            <div className="font-medium mb-2">Shortcuts</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Edit</span>
                <span className="text-white/70">⌘ + click (on text)</span>
              </div>
              <div className="flex justify-between">
                <span>Remove Character</span>
                <span className="text-white/70">⌘ + click (on character)</span>
              </div>
              <div className="flex justify-between">
                <span>Add Character</span>
                <span className="text-white/70">⌥ + select text</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
