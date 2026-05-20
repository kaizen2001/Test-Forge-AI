import React from 'react';
import { Box, Typography } from '@mui/material';
import './SectionHeader.css';

/**
 * SectionHeader Component
 * Reusable section header with icon and title
 * 
 * @param {ReactNode} icon - Icon to display
 * @param {string} title - Section title text
 * @param {string} subtitle - Optional subtitle
 */
export const SectionHeader = ({ icon, title, subtitle }) => {
  return (
    <Box className="section-header">
      <Box className="section-header__content">
        {icon && <Box className="section-header__icon">{icon}</Box>}
        <Box>
          <Typography variant="h5" className="section-header__title">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" className="section-header__subtitle">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};
