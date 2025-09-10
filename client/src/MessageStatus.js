import React from 'react';

// Component for message status indicators (single tick, double tick, read status)
function MessageStatus({ status, size = 'normal', isStatic = false, readCount = 0, readers = [] }) {
    // Define icon sizes based on the size prop
    const iconSize = size === 'small' ? 14 : 16;
    const strokeWidth = size === 'small' ? 2.5 : 2.5;
    const gapSize = size === 'small' ? 4 : 6;

    // Ensure status has a valid value to avoid missing ticks
    const messageStatus = status || 'sent';

    // Group chat with read status
    if (messageStatus === 'group-read' && readCount > 0) {
        return (
            <div className="status-container">
                <div className="double-tick read">
                    <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#00ffcc" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="tick tick-1">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#00ffcc" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="tick tick-2" style={{ left: gapSize }}>
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <span className="read-count">{readCount}</span>

                {/* Show reader tooltip on hover */}
                {readers.length > 0 && (
                    <div className="readers-tooltip">
                        <div className="tooltip-content">
                            <span className="tooltip-title">Leído por:</span>
                            <ul className="readers-list">
                                {readers.map(reader => (
                                    <li key={reader.id_usuario}>{reader.nombre}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        );
    } else if (messageStatus === 'read') {
        return (
            <div className="double-tick read">
                <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#00ffcc" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="tick tick-1">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#00ffcc" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="tick tick-2" style={{ left: gapSize }}>
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
        );
    } else if (messageStatus === 'delivered') {
        return (
            <div className="double-tick">
                <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="rgba(224, 224, 224, 0.9)" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="tick tick-1">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="rgba(224, 224, 224, 0.9)" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="tick tick-2" style={{ left: gapSize }}>
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
        );
    } else {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="rgba(224, 224, 224, 0.9)" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="tick">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        );
    }
}

export default MessageStatus;
