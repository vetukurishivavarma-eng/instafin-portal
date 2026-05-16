/**
 * ActionBar Component
 * Two buttons: Download PDF and Share on WhatsApp
 */

import React, { useState } from 'react';
import type { Selection, ChecklistItem } from '../checklist-spec';
import { downloadPDF } from '../export/pdf';
import { shareOnWhatsApp, isWebShareAvailable } from '../export/whatsapp';

interface ActionBarProps {
  selection: Selection;
  items: ChecklistItem[];
}

const ActionBar: React.FC<ActionBarProps> = ({ selection, items }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleDownloadPDF = async () => {
    if (items.length === 0) {
      alert('No checklist items to export. Please complete the loan selection first.');
      return;
    }

    setIsDownloading(true);
    try {
      await downloadPDF(selection, items);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleWhatsAppShare = async () => {
    if (items.length === 0) {
      alert('No checklist items to share. Please complete the loan selection first.');
      return;
    }

    setIsSharing(true);
    try {
      await shareOnWhatsApp({ loanType: selection.loanType, items });
    } catch (error) {
      console.error('Error sharing on WhatsApp:', error);
      alert('Failed to share on WhatsApp. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  // Disable buttons if no items
  const isDisabled = items.length === 0;

  return (
    <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-200">
      {/* Download PDF Button */}
      <button
        onClick={handleDownloadPDF}
        disabled={isDisabled || isDownloading}
        className={`
          inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm
          transition-all duration-200 ease-in-out
          ${
            isDisabled
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm hover:shadow-md'
          }
        `}
        title={isDisabled ? 'Complete loan selection to enable PDF download' : 'Download checklist as PDF'}
      >
        {isDownloading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg
              className="-ml-1 mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download PDF
          </>
        )}
      </button>

      {/* Share on WhatsApp Button */}
      <button
        onClick={handleWhatsAppShare}
        disabled={isDisabled || isSharing}
        className={`
          inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm
          transition-all duration-200 ease-in-out
          ${
            isDisabled
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700 shadow-sm hover:shadow-md'
          }
        `}
        title={
          isDisabled
            ? 'Complete loan selection to enable sharing'
            : isWebShareAvailable()
              ? 'Share via WhatsApp or other apps'
              : 'Share checklist on WhatsApp'
        }
      >
        {isSharing ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Sharing...
          </>
        ) : (
          <>
            <svg
              className="-ml-1 mr-2 h-4 w-4"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Share on WhatsApp
          </>
        )}
      </button>
    </div>
  );
};

export default ActionBar;