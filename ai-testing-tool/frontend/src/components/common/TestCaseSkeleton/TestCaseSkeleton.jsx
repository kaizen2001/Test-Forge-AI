import React from 'react';
import { Box } from '@mui/material';
import './TestCaseSkeleton.css';

/**
 * TestCaseSkeleton Component
 * Loading placeholder for test cases
 * 
 * @param {number} count - Number of skeleton rows to show (default: 5)
 */
export const TestCaseSkeleton = ({ count = 5 }) => {
  return (
    <Box className="test-case-skeleton">
      {[...Array(count)].map((_, row) => (
        <Box key={row} className="test-case-skeleton__row">
          {/* Test Case ID skeleton */}
          <Box className="test-case-skeleton__cell test-case-skeleton__cell--id">
            <Box
              className="test-case-skeleton__shimmer"
              style={{ animationDelay: `${row * 0.08}s` }}
            />
          </Box>

          {/* Title skeleton */}
          <Box className="test-case-skeleton__cell test-case-skeleton__cell--title">
            <Box
              className="test-case-skeleton__shimmer"
              style={{ animationDelay: `${row * 0.08 + 0.1}s` }}
            />
          </Box>

          {/* Test Steps skeleton */}
          <Box className="test-case-skeleton__cell test-case-skeleton__cell--steps">
            <Box
              className="test-case-skeleton__shimmer"
              style={{ animationDelay: `${row * 0.08 + 0.2}s` }}
            />
          </Box>

          {/* Expected Result skeleton */}
          <Box className="test-case-skeleton__cell test-case-skeleton__cell--result">
            <Box
              className="test-case-skeleton__shimmer"
              style={{ animationDelay: `${row * 0.08 + 0.3}s` }}
            />
          </Box>

          {/* Priority skeleton */}
          <Box className="test-case-skeleton__cell test-case-skeleton__cell--priority">
            <Box
              className="test-case-skeleton__shimmer"
              style={{ animationDelay: `${row * 0.08 + 0.4}s` }}
            />
          </Box>

          {/* Actions skeleton */}
          <Box className="test-case-skeleton__cell test-case-skeleton__cell--actions">
            <Box
              className="test-case-skeleton__shimmer"
              style={{ animationDelay: `${row * 0.08 + 0.5}s` }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
};
