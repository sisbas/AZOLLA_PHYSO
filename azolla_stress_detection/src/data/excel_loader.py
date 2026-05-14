"""
Excel data loader for Azolla treatment data.

Handles loading, parsing, and validating Excel files with:
- Biomass measurements
- Pigment concentrations
- Spectral data
- Metadata (treatment groups, replicates)
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class ExcelDataLoader:
    """
    Load and process Excel files containing Azolla treatment data.
    
    Expected columns:
    - Metadata: Grup Kodu, Grup Adı, Tekrar, Deney Süresi
    - Biomass: Başlangıç Azolla (g), Net Hasat Ağırlığı (g), Mutlak Büyüme (g), 
               Büyüme (%), RGR (g g⁻¹ gün⁻¹)
    - Pigments: Klorofil a, Klorofil b, Toplam Klorofil, Karotenoid (mg/g FW)
    - Spectral: Abs470, Abs646, Abs663
    """
    
    # Column name mappings for standardization
    COLUMN_MAPPING = {
        # Metadata
        'Grup Kodu': 'group_code',
        'Grup Adı': 'group_name',
        'Tekrar': 'replicate',
        'Deney Süresi': 'experiment_duration',
        
        # Biomass
        'Başlangıç Azolla (g)': 'initial_biomass',
        'Net Hasat Ağırlığı (g)': 'net_harvest_weight',
        'Mutlak Büyüme (g)': 'absolute_growth',
        'Büyüme (%)': 'growth_percentage',
        'RGR (g g⁻¹ gün⁻¹)': 'rgr',
        
        # Pigments
        'Klorofil a': 'chlorophyll_a',
        'Klorofil b': 'chlorophyll_b',
        'Toplam Klorofil': 'total_chlorophyll',
        'Karotenoid (mg/g FW)': 'carotenoids',
        
        # Spectral
        'Abs470': 'absorbance_470',
        'Abs646': 'absorbance_646',
        'Abs663': 'absorbance_663',
    }
    
    TREATMENT_GROUPS = [
        'K', 'Gd', 'Gd+BR10^-7', 'Gd+BR10^-8', 'Gd+BR10^-9',
        'BR10^-7', 'BR10^-8', 'BR10^-9'
    ]
    
    def __init__(self, excel_path: str, sheet_name: int = 0):
        """
        Initialize the Excel data loader.
        
        Args:
            excel_path: Path to the Excel file
            sheet_name: Sheet name or index to load
        """
        self.excel_path = Path(excel_path)
        self.sheet_name = sheet_name
        self.df: Optional[pd.DataFrame] = None
        self.df_clean: Optional[pd.DataFrame] = None
        
        if not self.excel_path.exists():
            logger.warning(f"Excel file not found: {self.excel_path}")
    
    def load(self, skip_rows: int = 0) -> 'ExcelDataLoader':
        """
        Load the Excel file into a DataFrame.
        
        Args:
            skip_rows: Number of rows to skip at the beginning
            
        Returns:
            Self for method chaining
        """
        try:
            self.df = pd.read_excel(
                self.excel_path,
                sheet_name=self.sheet_name,
                skiprows=skip_rows,
                engine='openpyxl'
            )
            logger.info(f"Loaded Excel file: {self.excel_path}, shape: {self.df.shape}")
        except Exception as e:
            logger.error(f"Error loading Excel file: {e}")
            raise
        
        return self
    
    def rename_columns(self) -> 'ExcelDataLoader':
        """
        Rename columns to standardized English names.
        
        Returns:
            Self for method chaining
        """
        if self.df is None:
            raise ValueError("No data loaded. Call load() first.")
        
        # Rename known columns
        rename_dict = {k: v for k, v in self.COLUMN_MAPPING.items() if k in self.df.columns}
        self.df = self.df.rename(columns=rename_dict)
        
        # Keep unmapped columns as-is but strip whitespace
        self.df.columns = [col.strip() if col not in rename_dict.values() else col 
                          for col in self.df.columns]
        
        logger.info(f"Renamed {len(rename_dict)} columns")
        return self
    
    def clean_data(self) -> 'ExcelDataLoader':
        """
        Clean the data: handle missing values, remove duplicates, validate types.
        
        Returns:
            Self for method chaining
        """
        if self.df is None:
            raise ValueError("No data loaded. Call load() first.")
        
        self.df_clean = self.df.copy()
        
        # Remove completely empty rows/columns
        self.df_clean = self.df_clean.dropna(how='all', axis=0)
        self.df_clean = self.df_clean.dropna(how='all', axis=1)
        
        # Strip whitespace from string columns
        for col in self.df_clean.select_dtypes(include=['object']).columns:
            self.df_clean[col] = self.df_clean[col].astype(str).str.strip()
        
        # Convert numeric columns
        numeric_cols = [
            'initial_biomass', 'net_harvest_weight', 'absolute_growth',
            'growth_percentage', 'rgr', 'chlorophyll_a', 'chlorophyll_b',
            'total_chlorophyll', 'carotenoids', 'absorbance_470',
            'absorbance_646', 'absorbance_663'
        ]
        
        for col in numeric_cols:
            if col in self.df_clean.columns:
                self.df_clean[col] = pd.to_numeric(self.df_clean[col], errors='coerce')
        
        # Replace 'Kontrol' or similar with 'K' for consistency
        if 'group_code' in self.df_clean.columns:
            self.df_clean['group_code'] = self.df_clean['group_code'].replace(
                {'Kontrol': 'K', 'Control': 'K', 'kontrol': 'K'}
            )
        
        logger.info(f"Cleaned data shape: {self.df_clean.shape}")
        return self
    
    def validate(self) -> Tuple[bool, List[str]]:
        """
        Validate the loaded data.
        
        Returns:
            Tuple of (is_valid, list of validation messages)
        """
        if self.df_clean is None:
            return False, ["No cleaned data available"]
        
        messages = []
        is_valid = True
        
        # Check for required columns
        required_cols = ['group_code', 'replicate']
        missing_cols = [col for col in required_cols if col not in self.df_clean.columns]
        if missing_cols:
            messages.append(f"Missing required columns: {missing_cols}")
            is_valid = False
        
        # Check for treatment groups
        if 'group_code' in self.df_clean.columns:
            unique_groups = set(self.df_clean['group_code'].unique())
            expected_groups = set(self.TREATMENT_GROUPS)
            
            # Check if at least some expected groups are present
            common_groups = unique_groups & expected_groups
            if not common_groups:
                messages.append(
                    f"No expected treatment groups found. Found: {unique_groups}"
                )
                is_valid = False
            else:
                messages.append(f"Found treatment groups: {common_groups}")
        
        # Check for missing values in key columns
        key_cols = ['rgr', 'total_chlorophyll', 'carotenoids']
        for col in key_cols:
            if col in self.df_clean.columns:
                missing_pct = self.df_clean[col].isna().mean() * 100
                if missing_pct > 50:
                    messages.append(f"High missing rate in {col}: {missing_pct:.1f}%")
        
        return is_valid, messages
    
    def get_treatment_data(self, group_code: str) -> pd.DataFrame:
        """
        Get data for a specific treatment group.
        
        Args:
            group_code: Treatment group code (e.g., 'K', 'Gd')
            
        Returns:
            DataFrame with data for the specified group
        """
        if self.df_clean is None:
            raise ValueError("No cleaned data available")
        
        return self.df_clean[self.df_clean['group_code'] == group_code].copy()
    
    def get_control_data(self) -> pd.DataFrame:
        """
        Get control group data (group_code == 'K').
        
        Returns:
            DataFrame with control group data
        """
        return self.get_treatment_data('K')
    
    def compute_derived_metrics(self) -> 'ExcelDataLoader':
        """
        Compute derived metrics from raw measurements.
        
        Adds columns:
        - chlorophyll_ratio: chlorophyll_a / chlorophyll_b
        - total_pigments: total_chlorophyll + carotenoids
        - stress_index: normalized deviation from control
        
        Returns:
            Self for method chaining
        """
        if self.df_clean is None:
            raise ValueError("No cleaned data available")
        
        # Chlorophyll ratio
        if 'chlorophyll_a' in self.df_clean.columns and 'chlorophyll_b' in self.df_clean.columns:
            self.df_clean['chlorophyll_ratio'] = (
                self.df_clean['chlorophyll_a'] / 
                self.df_clean['chlorophyll_b'].replace(0, np.nan)
            )
        
        # Total pigments
        if 'total_chlorophyll' in self.df_clean.columns and 'carotenoids' in self.df_clean.columns:
            self.df_clean['total_pigments'] = (
                self.df_clean['total_chlorophyll'] + self.df_clean['carotenoids']
            )
        
        # Compute stress index relative to control
        control_data = self.get_control_data()
        if len(control_data) > 0 and 'rgr' in self.df_clean.columns:
            control_rgr_mean = control_data['rgr'].mean()
            if not np.isnan(control_rgr_mean) and control_rgr_mean != 0:
                self.df_clean['rgr_deviation'] = (
                    (self.df_clean['rgr'] - control_rgr_mean) / control_rgr_mean
                )
        
        logger.info("Computed derived metrics")
        return self
    
    def encode_treatments(self) -> Tuple[pd.DataFrame, Dict]:
        """
        One-hot encode treatment groups for ML models.
        
        Returns:
            Tuple of (encoded DataFrame, encoding dictionary)
        """
        if self.df_clean is None:
            raise ValueError("No cleaned data available")
        
        df_encoded = self.df_clean.copy()
        
        # One-hot encode treatment groups
        if 'group_code' in df_encoded.columns:
            treatment_dummies = pd.get_dummies(
                df_encoded['group_code'],
                prefix='treatment'
            )
            df_encoded = pd.concat([df_encoded, treatment_dummies], axis=1)
        
        # Create encoding dictionary for later use
        encoding_dict = {
            'treatments': list(df_encoded['group_code'].unique()),
            'n_treatments': len(df_encoded['group_code'].unique())
        }
        
        return df_encoded, encoding_dict
    
    def get_feature_matrix(self, include_spectral: bool = True) -> pd.DataFrame:
        """
        Extract feature matrix for ML models.
        
        Args:
            include_spectral: Whether to include spectral features
            
        Returns:
            Feature matrix DataFrame
        """
        if self.df_clean is None:
            raise ValueError("No cleaned data available")
        
        feature_cols = [
            'initial_biomass', 'net_harvest_weight', 'absolute_growth',
            'growth_percentage', 'rgr', 'chlorophyll_a', 'chlorophyll_b',
            'total_chlorophyll', 'carotenoids', 'chlorophyll_ratio',
            'total_pigments', 'rgr_deviation'
        ]
        
        if include_spectral:
            feature_cols.extend(['absorbance_470', 'absorbance_646', 'absorbance_663'])
        
        # Filter to existing columns
        existing_cols = [col for col in feature_cols if col in self.df_clean.columns]
        
        return self.df_clean[existing_cols].copy()
    
    def to_dict(self) -> Dict:
        """
        Convert cleaned data to dictionary format.
        
        Returns:
            Dictionary with group-wise data
        """
        if self.df_clean is None:
            raise ValueError("No cleaned data available")
        
        result = {}
        for group in self.df_clean['group_code'].unique():
            group_data = self.get_treatment_data(group)
            result[group] = {
                'data': group_data.to_dict('records'),
                'summary': {
                    col: {
                        'mean': group_data[col].mean(),
                        'std': group_data[col].std(),
                        'count': group_data[col].count()
                    }
                    for col in group_data.select_dtypes(include=[np.number]).columns
                }
            }
        
        return result
    
    def save_processed(self, output_path: str) -> None:
        """
        Save processed data to CSV.
        
        Args:
            output_path: Path to save the processed CSV
        """
        if self.df_clean is None:
            raise ValueError("No cleaned data available")
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        self.df_clean.to_csv(output_path, index=False)
        logger.info(f"Saved processed data to: {output_path}")
    
    def get_dataframe(self) -> pd.DataFrame:
        """Get the cleaned DataFrame."""
        if self.df_clean is None:
            raise ValueError("No cleaned data available. Call load() and clean_data() first.")
        return self.df_clean.copy()
