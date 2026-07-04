import React from 'react';

const GraphContainer = ({ title, children, rightAction }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full hover:shadow-md transition-shadow">
      <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
        <h3 className="text-gray-800 font-semibold text-sm">{title}</h3>
        {rightAction && <div>{rightAction}</div>}
      </div>
      <div className="p-5 flex-grow flex items-center justify-center min-h-[300px]">
        {children}
      </div>
    </div>
  );
};

export default React.memo(GraphContainer);
