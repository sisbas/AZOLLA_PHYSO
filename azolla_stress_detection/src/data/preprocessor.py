"""
Data preprocessor for merging and preparing multimodal data.

Handles:
- Merging Excel and image-derived features
- Feature scaling and normalization
- Train/test split with stratification
- Handling missing data
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from typing import Dict, List, Optional, Tuple, Union
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class DataPreprocessor:
    """
    Preprocess and prepare multimodal data for ML models.
    
    Combines tabular Excel data with image-derived features,
    handles missing values, and prepares train/test splits.
    """
    
    def __init__(self, random_state: int = 42):
        """
        Initialize the preprocessor.
        
        Args:
            random_state: Random seed for reproducibility
        """
        self.random_state = random_state
        self.scaler = StandardScaler()
        self.treatment_encoder = LabelEncoder()
        self.feature_names: List[str] = []
        self.is_fitted = False
    
    def merge_data(
        self,
        excel_df: pd.DataFrame,
        image_features_df: pd.DataFrame,
        on_columns: List[str] = None
    ) -> pd.DataFrame:
        """
        Merge Excel data with image-derived features.
        
        Args:
            excel_df: DataFrame from ExcelDataLoader
            image_features_df: DataFrame with image features
            on_columns: Columns to merge on (default: ['group_code', 'replicate', 'day'])
            
        Returns:
            Merged DataFrame
        """
        if on_columns is None:
            on_columns = ['treatment', 'replicate', 'day']
        
        # Ensure merge columns exist
        available_cols = [col for col in on_columns if col in excel_df.columns and col in image_features_df.columns]
        
        if not available_cols:
            logger.warning("No common columns for merge. Using index-based concatenation.")
            # Fallback: concatenate side by side
            merged = pd.concat([excel_df.reset_index(drop=True), image_features_df.reset_index(drop=True)], axis=1)
        else:
            merged = pd.merge(
                excel_df,
                image_features_df,
                on=available_cols,
                how='outer'
            )
        
        logger.info(f"Merged data shape: {merged.shape}")
        return merged
    
    def handle_missing_values(
        self,
        df: pd.DataFrame,
        strategy: str = 'median',
        fill_value: float = 0.0
    ) -> pd.DataFrame:
        """
        Handle missing values in the dataset.
        
        Args:
            df: Input DataFrame
            strategy: 'mean', 'median', 'mode', or 'constant'
            fill_value: Value to use for 'constant' strategy
            
        Returns:
            DataFrame with missing values handled
        """
        df_clean = df.copy()
        
        for col in df_clean.columns:
            if df_clean[col].isna().any():
                if df_clean[col].dtype in [np.float64, np.int64, np.float32, np.int32]:
                    if strategy == 'mean':
                        df_clean[col] = df_clean[col].fillna(df_clean[col].mean())
                    elif strategy == 'median':
                        df_clean[col] = df_clean[col].fillna(df_clean[col].median())
                    elif strategy == 'constant':
                        df_clean[col] = df_clean[col].fillna(fill_value)
                else:
                    df_clean[col] = df_clean[col].fillna('Unknown')
        
        missing_count = df_clean.isna().sum().sum()
        logger.info(f"Missing values after handling: {missing_count}")
        
        return df_clean
    
    def encode_categorical(
        self,
        df: pd.DataFrame,
        categorical_cols: List[str],
        method: str = 'onehot'
    ) -> Tuple[pd.DataFrame, Dict]:
        """
        Encode categorical variables.
        
        Args:
            df: Input DataFrame
            categorical_cols: List of categorical column names
            method: 'onehot' or 'label'
            
        Returns:
            Tuple of (encoded DataFrame, encoding info dict)
        """
        df_encoded = df.copy()
        encoding_info = {}
        
        for col in categorical_cols:
            if col not in df_encoded.columns:
                continue
            
            if method == 'onehot':
                dummies = pd.get_dummies(df_encoded[col], prefix=col)
                df_encoded = pd.concat([df_encoded, dummies], axis=1)
                df_encoded = df_encoded.drop(col, axis=1)
                encoding_info[col] = {'method': 'onehot', 'categories': list(dummies.columns)}
                
            elif method == 'label':
                if col == 'treatment' or col == 'group_code':
                    encoder = LabelEncoder()
                    df_encoded[f'{col}_encoded'] = encoder.fit_transform(df_encoded[col].astype(str))
                    encoding_info[col] = {
                        'method': 'label',
                        'classes': list(encoder.classes_)
                    }
                else:
                    encoder = LabelEncoder()
                    df_encoded[f'{col}_encoded'] = encoder.fit_transform(df_encoded[col].astype(str))
                    encoding_info[col] = {
                        'method': 'label',
                        'classes': list(encoder.classes_)
                    }
        
        logger.info(f"Encoded {len(categorical_cols)} categorical columns")
        return df_encoded, encoding_info
    
    def scale_features(
        self,
        X: np.ndarray,
        fit: bool = True
    ) -> np.ndarray:
        """
        Scale numerical features.
        
        Args:
            X: Feature matrix
            fit: Whether to fit the scaler (True for training, False for inference)
            
        Returns:
            Scaled feature matrix
        """
        if fit:
            X_scaled = self.scaler.fit_transform(X)
            self.is_fitted = True
        else:
            if not self.is_fitted:
                logger.warning("Scaler not fitted. Fitting now.")
                X_scaled = self.scaler.fit_transform(X)
            else:
                X_scaled = self.scaler.transform(X)
        
        return X_scaled
    
    def prepare_train_test_split(
        self,
        X: np.ndarray,
        y: np.ndarray,
        test_size: float = 0.2,
        stratify: bool = True,
        random_state: int = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Prepare train/test split.
        
        Args:
            X: Feature matrix
            y: Target vector
            test_size: Fraction of data for testing
            stratify: Whether to stratify by class
            random_state: Random seed
            
        Returns:
            Tuple of (X_train, X_test, y_train, y_test)
        """
        if random_state is None:
            random_state = self.random_state
        
        stratify_y = y if stratify else None
        
        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=test_size,
            stratify=stratify_y,
            random_state=random_state
        )
        
        logger.info(f"Train size: {len(X_train)}, Test size: {len(X_test)}")
        return X_train, X_test, y_train, y_test
    
    def create_target_variables(
        self,
        df: pd.DataFrame,
        target_type: str = 'classification'
    ) -> Tuple[np.ndarray, List[str]]:
        """
        Create target variables for ML models.
        
        Args:
            df: Input DataFrame
            target_type: 'classification' or 'regression'
            
        Returns:
            Tuple of (target array, target names)
        """
        targets = []
        target_names = []
        
        if target_type == 'classification':
            # Create stress classes based on RGR deviation or chlorophyll loss
            if 'rgr_deviation' in df.columns:
                # Define stress levels based on RGR deviation from control
                def classify_stress(deviation):
                    if pd.isna(deviation):
                        return 1  # Moderate (unknown)
                    if deviation > -0.1:
                        return 0  # Early/No stress
                    elif deviation > -0.3:
                        return 1  # Moderate stress
                    else:
                        return 2  # Severe stress
                
                df['stress_class'] = df['rgr_deviation'].apply(classify_stress)
                targets.append(df['stress_class'].values)
                target_names.append('stress_class')
            
            if 'total_chlorophyll' in df.columns and 'group_code' in df.columns:
                # Alternative: classify based on chlorophyll relative to control
                control_chl = df[df['group_code'] == 'K']['total_chlorophyll'].mean()
                if not np.isnan(control_chl):
                    df['chl_stress'] = (df['total_chlorophyll'] < control_chl * 0.7).astype(int)
                    targets.append(df['chl_stress'].values)
                    target_names.append('chl_stress')
        
        elif target_type == 'regression':
            # Continuous targets
            regression_targets = ['rgr', 'rgr_deviation', 'total_chlorophyll', 'carotenoids']
            for col in regression_targets:
                if col in df.columns:
                    targets.append(df[col].values)
                    target_names.append(col)
        
        if not targets:
            logger.warning("No target variables created. Check input DataFrame columns.")
            return np.array([]), []
        
        return targets[0] if len(targets) == 1 else tuple(targets), target_names
    
    def select_features(
        self,
        df: pd.DataFrame,
        feature_types: List[str] = ['color', 'texture', 'morphology', 'tabular']
    ) -> Tuple[np.ndarray, List[str]]:
        """
        Select features based on type.
        
        Args:
            df: Input DataFrame
            feature_types: Types of features to include
            
        Returns:
            Tuple of (feature matrix, feature names)
        """
        feature_columns = []
        
        # Color indices
        if 'color' in feature_types:
            color_cols = [
                'ExG', 'VARI', 'GLI', 'ExR', 'YI', 'GMI', 'BYR',
                'L_mean', 'a_mean', 'b_mean',
                'H_mean', 'S_mean', 'V_mean'
            ]
            feature_columns.extend([c for c in color_cols if c in df.columns])
        
        # Texture features
        if 'texture' in feature_types:
            texture_cols = [
                'contrast', 'homogeneity', 'energy', 'correlation'
            ]
            feature_columns.extend([c for c in texture_cols if c in df.columns])
        
        # Morphological features
        if 'morphology' in feature_types:
            morph_cols = ['area', 'perimeter', 'solidity', 'extent']
            feature_columns.extend([c for c in morph_cols if c in df.columns])
        
        # Tabular features from Excel
        if 'tabular' in feature_types:
            tabular_cols = [
                'rgr', 'chlorophyll_a', 'chlorophyll_b', 'total_chlorophyll',
                'carotenoids', 'growth_percentage', 'absolute_growth'
            ]
            feature_columns.extend([c for c in tabular_cols if c in df.columns])
        
        # Remove duplicates while preserving order
        feature_columns = list(dict.fromkeys(feature_columns))
        
        if not feature_columns:
            logger.warning("No features selected. Check feature_types and DataFrame columns.")
            return np.array([]), []
        
        X = df[feature_columns].values
        self.feature_names = feature_columns
        
        logger.info(f"Selected {len(feature_columns)} features")
        return X, feature_columns
    
    def fit_transform(
        self,
        df: pd.DataFrame,
        target_col: str = 'stress_class'
    ) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """
        Full preprocessing pipeline: select features, scale, create targets.
        
        Args:
            df: Input DataFrame
            target_col: Name of target column
            
        Returns:
            Tuple of (X_scaled, y, feature_names)
        """
        # Select features
        X, feature_names = self.select_features(df)
        
        if X.size == 0:
            raise ValueError("No features selected")
        
        # Scale features
        X_scaled = self.scale_features(X, fit=True)
        
        # Get target
        if target_col in df.columns:
            y = df[target_col].values
        else:
            y = np.zeros(len(df))
            logger.warning(f"Target column '{target_col}' not found. Using zeros.")
        
        return X_scaled, y, feature_names
    
    def transform(
        self,
        df: pd.DataFrame
    ) -> np.ndarray:
        """
        Transform new data using fitted preprocessor.
        
        Args:
            df: Input DataFrame
            
        Returns:
            Scaled feature matrix
        """
        X, _ = self.select_features(df)
        
        if X.size == 0:
            raise ValueError("No features selected")
        
        return self.scale_features(X, fit=False)
    
    def save_preprocessing_info(self, output_path: str) -> None:
        """
        Save preprocessing information for later use.
        
        Args:
            output_path: Path to save JSON file
        """
        import json
        
        info = {
            'feature_names': self.feature_names,
            'is_fitted': self.is_fitted,
            'scaler_mean': self.scaler.mean_.tolist() if self.is_fitted else None,
            'scaler_scale': self.scaler.scale_.tolist() if self.is_fitted else None,
            'random_state': self.random_state
        }
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w') as f:
            json.dump(info, f, indent=2)
        
        logger.info(f"Saved preprocessing info to {output_path}")
    
    def load_preprocessing_info(self, input_path: str) -> 'DataPreprocessor':
        """
        Load preprocessing information.
        
        Args:
            input_path: Path to JSON file
            
        Returns:
            Self for method chaining
        """
        import json
        
        with open(input_path, 'r') as f:
            info = json.load(f)
        
        self.feature_names = info['feature_names']
        self.is_fitted = info['is_fitted']
        self.random_state = info['random_state']
        
        if self.is_fitted and info['scaler_mean'] is not None:
            self.scaler.mean_ = np.array(info['scaler_mean'])
            self.scaler.scale_ = np.array(info['scaler_scale'])
            self.scaler.var_ = self.scaler.scale_ ** 2
            self.scaler.n_features_in_ = len(self.feature_names)
        
        logger.info(f"Loaded preprocessing info from {input_path}")
        return self
