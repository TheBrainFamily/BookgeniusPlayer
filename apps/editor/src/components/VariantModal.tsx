import React, { useState, useEffect } from 'react';
import type { Variant } from '../types';
import {splitTextIntoSentences} from "../utils/splitTextIntoSentences.ts";

interface VariantModalProps {
  variant: Variant | null;
  isOpen: boolean;
  onClose: () => void;
  currentIndex: number;
  totalVariants: number;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  onVariantUpdate?: (updatedVariant: Variant) => Promise<void>;
}

export const VariantModal: React.FC<VariantModalProps> = ({ 
  variant, 
  isOpen, 
  onClose, 
  currentIndex, 
  totalVariants, 
  onNext, 
  onPrev, 
  hasNext, 
  hasPrev,
  onVariantUpdate 
}) => {
  const [originalVariant, setOriginalVariant] = useState<Variant | null>(variant);

  const [localVariant, setLocalVariant] = useState<Variant | null>(variant);
  const [variationTexts, setVariationTexts] = useState<Record<number, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

  // Update local variant when prop changes
  useEffect(() => {
    setLocalVariant(variant);
    setOriginalVariant(variant);
    setHasUnsavedChanges(false);
    // Initialize variation texts by joining sentences with '. '
    if (variant?.simplifications) {
      const texts: Record<number, string> = {};
      variant.simplifications.forEach((simplification, index) => {
        if (simplification.sentences) {
          texts[index] = simplification.sentences.join('. ');
        }
      });
      setVariationTexts(texts);
    }
  }, [variant]);

  // Check for changes whenever local data or text changes
  useEffect(() => {
    if (!originalVariant || !localVariant) return;
    
    // Check if localVariant has changed
    const variantChanged = JSON.stringify(originalVariant) !== JSON.stringify(localVariant);
    
    // Check if any text is being edited (different from what's saved in localVariant)
    let textChanged = false;
    if (originalVariant.simplifications) {
      originalVariant.simplifications.forEach((simplification, index) => {
        const originalText = simplification.sentences?.join('. ') || '';
        const currentText = variationTexts[index] || '';
        if (originalText !== currentText) {
          textChanged = true;
        }
      });
    }
    
    const hasChanges = variantChanged || textChanged;
    console.log('Change detection:', { hasChanges, variantChanged, textChanged, originalVariant, localVariant, variationTexts });
    setHasUnsavedChanges(hasChanges);
  }, [localVariant, originalVariant, variationTexts]);

  if (!isOpen || !localVariant) return null;

  console.log('Rendering modal with hasUnsavedChanges:', hasUnsavedChanges);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowCloseConfirmation(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (localVariant && onVariantUpdate) {
      onVariantUpdate(localVariant);
      setOriginalVariant(localVariant);
      setHasUnsavedChanges(false);
    }
  };

  const handleDiscardChanges = () => {
    setShowCloseConfirmation(false);
    onClose();
  };

  const handleKeepEditing = () => {
    setShowCloseConfirmation(false);
  };

  const handleSentencesChange = (simplificationIndex: number, updatedSentences: string) => {
    // Update variationTexts state
    setVariationTexts(prev => ({
      ...prev,
      [simplificationIndex]: updatedSentences
    }));

    if (localVariant) {
      const newVariant = {
        ...localVariant,
        simplifications: localVariant.simplifications.map((simplification, index) =>
          index === simplificationIndex
            ? {
              ...simplification,
              sentences: splitTextIntoSentences(updatedSentences),
            }
            : simplification
        )
      }
      setLocalVariant(newVariant)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div 
        className="modal-content"
        style={{
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          padding: '0',
          width: '90vw',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
          border: '1px solid #e5e7eb',
        }}
      >
        {/* Header */}
        <div style={{ 
          padding: '24px 32px', 
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '20px', 
              fontWeight: '600',
              color: '#1f2937',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Paragraph Variations - {localVariant.id}
            </h1>
            {hasUnsavedChanges && (
              <p style={{ 
                margin: '4px 0 0 0', 
                fontSize: '12px', 
                color: '#f59e0b',
                fontWeight: '500'
              }}>
                • Unsaved changes
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {hasUnsavedChanges && (
              <button
                onClick={handleSave}
                style={{
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
              >
                Save
              </button>
            )}
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px',
                color: '#9ca3af',
                borderRadius: '4px',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              ×
            </button>
          </div>
        </div>

        {/* Navigation */}
        {totalVariants > 1 && (
          <div style={{ 
            padding: '16px 32px',
            backgroundColor: 'white',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex', 
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: hasPrev ? 'white' : '#f9fafb',
                cursor: hasPrev ? 'pointer' : 'not-allowed',
                color: hasPrev ? '#374151' : '#9ca3af',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              ← Previous
            </button>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
              {currentIndex + 1} of {totalVariants} variants on this line
            </p>
            <button
              onClick={onNext}
              disabled={!hasNext}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: hasNext ? 'white' : '#f9fafb',
                cursor: hasNext ? 'pointer' : 'not-allowed',
                color: hasNext ? '#374151' : '#9ca3af',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Next →
            </button>
          </div>
        )}
        
        {/* Content */}
        <div style={{ 
          padding: '32px', 
          maxHeight: '70vh', 
          overflow: 'auto',
          backgroundColor: '#f8f9fa'
        }}>
          {/* Original Sentence */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1f2937' 
              }}>
                Original Sentence
              </h2>
              {localVariant.analysis?.score && (
                <span style={{
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  Score: {localVariant.analysis.score}
                </span>
              )}
            </div>
            
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              marginBottom: '16px'
            }}>
              <p style={{ 
                margin: 0, 
                fontSize: '15px', 
                lineHeight: '1.6',
                color: '#1f2937'
              }}>
                {localVariant.analysis?.originalSentence || 'No original sentence available'}
              </p>
            </div>

            {localVariant.analysis?.reasoning && (
              <div style={{
                fontSize: '13px',
                fontStyle: 'italic',
                color: '#4b5563',
                lineHeight: '1.5',
                padding: '12px 0'
              }}>
                {localVariant.analysis.reasoning}
              </div>
            )}
          </div>

          {/* Simplified Variations */}
          {localVariant.simplifications && localVariant.simplifications.length > 0 && (
            <div>
              <h2 style={{ 
                margin: '0 0 24px 0', 
                fontSize: '16px', 
                fontWeight: '600', 
                color: '#1f2937' 
              }}>
                Simplified Variations:
              </h2>
              
              {localVariant.simplifications.map((simplification, index) => (
                <div key={index} style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h3 style={{ 
                        margin: 0, 
                        fontSize: '14px', 
                        fontWeight: '600', 
                        color: '#374151' 
                      }}>
                        Variation {index + 1}
                      </h3>
                      <span style={{
                        backgroundColor: simplification.score >= 70 ? '#d1fae5' : simplification.score >= 40 ? '#fef3c7' : '#fee2e2',
                        color: simplification.score >= 70 ? '#065f46' : simplification.score >= 40 ? '#92400e' : '#991b1b',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        Score: {simplification.score}
                      </span>
                    </div>
                  </div>

                  {simplification.reasoning && (
                    <div style={{
                      fontSize: '13px',
                      fontStyle: 'italic',
                      color: '#4b5563',
                      lineHeight: '1.5',
                      marginBottom: '16px',
                      padding: '12px 16px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}>
                      {simplification.reasoning}
                    </div>
                  )}

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '8px',
                      fontWeight: '500'
                    }}>
                      Sentences:
                    </div>
                    <div style={{
                      backgroundColor: 'white',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden'
                    }}>
                      <textarea
                        value={variationTexts[index] || ''}
                        onChange={(e) => handleSentencesChange(index, e.target.value)}
                        placeholder="Enter sentences separated by periods..."
                        style={{
                          width: '100%',
                          minHeight: '100px',
                          padding: '16px',
                          border: 'none',
                          outline: 'none',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          color: '#1f2937',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          backgroundColor: 'transparent'
                        }}
                      />
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                      marginTop: '4px',
                      fontStyle: 'italic'
                    }}>
                      Sentences will be automatically split by periods when you finish editing
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Confirmation Modal for Unsaved Changes */}
      {showCloseConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',
          }}>
            <h3 style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937'
            }}>
              Unsaved Changes
            </h3>
            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: '#6b7280',
              lineHeight: '1.5'
            }}>
              You have unsaved changes that will be lost if you close this modal. What would you like to do?
            </p>
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleKeepEditing}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  cursor: 'pointer',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Keep Editing
              </button>
              <button
                onClick={handleDiscardChanges}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  background: '#dc2626',
                  cursor: 'pointer',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};