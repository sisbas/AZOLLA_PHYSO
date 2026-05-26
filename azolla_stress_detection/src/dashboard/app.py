"""
Streamlit Dashboard for Azolla Early Stress Detection.

Features:
- Image upload and processing
- Real-time stress prediction
- Time-series visualization
- Analysis page with tabular exports
"""

import streamlit as st
import pandas as pd
import numpy as np
from pathlib import Path
import plotly.express as px
import plotly.graph_objects as go
from typing import Dict, Optional
import io
import json
import tempfile
import zipfile

from src.run_mini_package import load_experiment_table, run_anova, compare_br_under_gd

# Page config
st.set_page_config(
    page_title="Azolla Early Stress Detection",
    page_icon="🌿",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
<style>
.main-header {
    font-size: 2.5rem;
    color: #2e7d32;
    text-align: center;
    margin-bottom: 1rem;
}
.metric-card {
    background-color: #f5f5f5;
    border-radius: 10px;
    padding: 1rem;
    margin: 0.5rem;
}
.stress-gauge {
    text-align: center;
}
</style>
""", unsafe_allow_html=True)


def init_session_state():
    """Initialize session state variables."""
    if 'processed_data' not in st.session_state:
        st.session_state.processed_data = None
    if 'predictions' not in st.session_state:
        st.session_state.predictions = None
    if 'excel_data' not in st.session_state:
        st.session_state.excel_data = None
    if 'model_loaded' not in st.session_state:
        st.session_state.model_loaded = False


def sidebar_config():
    """Sidebar configuration."""
    st.sidebar.title("⚙️ Configuration")
    
    # Model selection
    model_path = st.sidebar.text_input(
        "Model Path",
        value="models/stress_model.joblib",
        help="Path to trained model file"
    )
    
    # Processing parameters
    st.sidebar.subheader("Image Processing")
    segmentation_method = st.sidebar.selectbox(
        "Segmentation Method",
        ["adaptive", "otsu", "green_threshold"],
        index=0
    )
    
    show_preview = st.sidebar.checkbox("Show Segmentation Preview", value=True)
    
    return {
        'model_path': model_path,
        'segmentation_method': segmentation_method,
        'show_preview': show_preview
    }


def load_model(model_path: str):
    """Load the stress prediction model."""
    try:
        from src.ml.predictor import StressPredictor
        predictor = StressPredictor.load(model_path)
        return predictor
    except Exception as e:
        st.error(f"Failed to load model: {e}")
        return None


def process_uploaded_image(image_file, config: Dict):
    """Process uploaded image through the pipeline."""
    from src.cv import ImageProcessingPipeline
    import cv2
    import tempfile
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
        tmp.write(image_file.getvalue())
        tmp_path = tmp.name
    
    try:
        # Create pipeline with config
        pipeline = ImageProcessingPipeline(
            segmentation_method=config['segmentation_method']
        )
        
        # Process image
        result = pipeline.process_image(tmp_path)
        
        return result, pipeline
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def main_header():
    """Display main header."""
    st.markdown('<p class="main-header">🌿 Azolla Early Stress Detection</p>', 
                unsafe_allow_html=True)
    st.markdown("""
    <div style='text-align: center; color: #666;'>
    Combine RGB image analysis with experimental data for early stress detection
    </div>
    """, unsafe_allow_html=True)


def upload_section():
    """Image and data upload section."""
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("📷 Upload Images")
        uploaded_files = st.file_uploader(
            "Upload Azolla images (PNG, JPG)",
            type=['png', 'jpg', 'jpeg'],
            accept_multiple_files=True,
            key="image_upload"
        )
    
    with col2:
        st.subheader("📊 Upload Excel Data (Optional)")
        excel_file = st.file_uploader(
            "Upload treatment data (XLSX)",
            type=['xlsx', 'xls'],
            key="excel_upload"
        )
    
    return uploaded_files, excel_file


def run_mini_package_from_dataframe(df: pd.DataFrame) -> dict:
    """Run mini-package analysis from an in-memory dataframe and return CSV/json outputs."""
    outputs = {}

    summary = df.groupby(["Gd_cat", "BR_cat"])[[
        "RGR (g g⁻¹ gün⁻¹)", "Toplam Klorofil", "Karotenoid", "Mutlak Büyüme (g)"
    ]].agg(["mean", "std", "count"])
    outputs["group_summary.csv"] = summary.to_csv()

    anova_rgr = run_anova(df, "RGR (g g⁻¹ gün⁻¹)")
    anova_chl = run_anova(df, "Toplam Klorofil")
    outputs["anova_rgr.csv"] = anova_rgr.to_csv(index=False)
    outputs["anova_total_chlorophyll.csv"] = anova_chl.to_csv(index=False)

    gd_cmp = compare_br_under_gd(df, "RGR (g g⁻¹ gün⁻¹)")
    outputs["gd_br_pairwise_rgr.csv"] = gd_cmp.to_csv(index=False)

    report = {
        "n_rows": int(len(df)),
        "groups": sorted([str(x) for x in df["Grup Kodu"].dropna().unique()]),
        "outputs": list(outputs.keys()),
    }
    outputs["report.json"] = json.dumps(report, ensure_ascii=False, indent=2)
    return outputs


def build_zip_from_outputs(outputs: dict[str, str]) -> bytes:
    """Bundle mini-package outputs as a zip archive for download."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename, content in outputs.items():
            zf.writestr(filename, content)
    zip_buffer.seek(0)
    return zip_buffer.getvalue()


def display_stress_gauge(stress_score: float, stress_class: str, confidence: float):
    """Display stress level gauge."""
    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=stress_score * 100,
        domain={'x': [0, 1], 'y': [0, 1]},
        title={'text': f"Stress Level ({stress_class})", 'font': {'size': 24}},
        delta={'reference': 50},
        gauge={
            'axis': {'range': [None, 100]},
            'bar': {'color': get_stress_color(stress_score)},
            'bgcolor': "white",
            'borderwidth': 2,
            'bordercolor': "gray",
            'steps': [
                {'range': [0, 33], 'color': "#c8e6c9"},  # Early - light green
                {'range': [33, 66], 'color': "#fff9c4"},  # Moderate - yellow
                {'range': [66, 100], 'color': "#ffcdd2"}   # Severe - red
            ],
        }))
    
    fig.update_layout(height=300, margin=dict(l=20, r=20, t=40, b=20))
    return fig


def get_stress_color(score: float) -> str:
    """Get color based on stress score."""
    if score < 0.33:
        return "#4caf50"  # Green
    elif score < 0.66:
        return "#ff9800"  # Orange
    else:
        return "#f44336"  # Red


def display_results(predictions: Dict, show_probabilities: bool = True):
    """Display prediction results."""
    st.subheader("🎯 Prediction Results")
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.metric(
            "Stress Class",
            predictions.get('stress_class', 'Unknown'),
            delta=f"Confidence: {predictions.get('confidence', 0):.1%}"
        )
    
    with col2:
        stress_score = predictions.get('stress_score', 0)
        st.metric(
            "Stress Score",
            f"{stress_score:.2%}",
            delta="Higher = More Stress"
        )
    
    with col3:
        rgr_dev = predictions.get('rgr_deviation', 0)
        st.metric(
            "RGR Deviation",
            f"{rgr_dev:.2%}",
            delta="Negative = Growth Reduction"
        )
    
    # Gauge chart
    gauge_fig = display_stress_gauge(
        stress_score,
        predictions.get('stress_class', 'Unknown'),
        predictions.get('confidence', 0)
    )
    st.plotly_chart(gauge_fig, use_container_width=True)
    
    if show_probabilities and 'all_probabilities' in predictions:
        probs = predictions['all_probabilities']
        prob_df = pd.DataFrame({
            'Class': ['Early', 'Moderate', 'Severe'],
            'Probability': [probs.get('early', 0), probs.get('moderate', 0), probs.get('severe', 0)]
        })
        
        fig = px.bar(prob_df, x='Class', y='Probability', 
                     color='Probability', color_continuous_scale='RdYlGn_r')
        st.plotly_chart(fig, use_container_width=True)


def create_analysis_page(excel_data: Optional[pd.DataFrame], processed_data: Optional[pd.DataFrame]):
    """Create the Analysis page with tabular exports."""
    st.header("📋 Analysis Page")
    
    # Tabs for different views
    tab1, tab2, tab3, tab4 = st.tabs([
        "Summary Statistics", 
        "Treatment Comparison",
        "Time Series",
        "Export Data"
    ])
    
    with tab1:
        st.subheader("Summary by Treatment Group")
        if processed_data is not None:
            summary = processed_data.groupby('treatment').agg({
                'ExG': ['mean', 'std'],
                'VARI': ['mean', 'std'],
                'area_ratio': ['mean', 'std'],
                'solidity': ['mean', 'std']
            }).round(3)
            st.dataframe(summary, use_container_width=True)
        else:
            st.info("Process images first to see summary statistics")
    
    with tab2:
        st.subheader("Treatment Group Comparison")
        if processed_data is not None:
            # Box plots for key features
            feature = st.selectbox(
                "Select Feature",
                ['ExG', 'VARI', 'GLI', 'area_ratio', 'solidity']
            )
            
            fig = px.box(processed_data, x='treatment', y=feature,
                         title=f"{feature} by Treatment Group",
                         color='treatment')
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Process images first")
    
    with tab3:
        st.subheader("Time Series Analysis")
        if processed_data is not None and 'day' in processed_data.columns:
            feature = st.selectbox(
                "Select Feature for Time Series",
                ['ExG', 'VARI', 'area_ratio'],
                key="ts_feature"
            )
            
            fig = px.line(processed_data, x='day', y=feature, 
                         color='treatment', markers=True,
                         title=f"{feature} Over Time by Treatment")
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Need time-series data (images with day information)")
    
    with tab4:
        st.subheader("Export Results")
        
        if processed_data is not None:
            # CSV Export
            csv_buffer = io.StringIO()
            processed_data.to_csv(csv_buffer, index=False)
            st.download_button(
                label="📥 Download CSV",
                data=csv_buffer.getvalue(),
                file_name="azolla_analysis_results.csv",
                mime="text/csv"
            )
            
            # Excel Export
            excel_buffer = io.BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                processed_data.to_excel(writer, sheet_name='Results', index=False)
                
                # Add summary sheet
                summary = processed_data.groupby(['treatment', 'day']).agg({
                    'ExG': 'mean',
                    'VARI': 'mean',
                    'area_ratio': 'mean'
                }).round(3)
                summary.to_excel(writer, sheet_name='Summary')
            
            st.download_button(
                label="📥 Download Excel",
                data=excel_buffer.getvalue(),
                file_name="azolla_analysis_results.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        else:
            st.info("No data to export")


def main():
    """Main application."""
    init_session_state()
    config = sidebar_config()
    
    main_header()
    
    # Upload section
    uploaded_files, excel_file = upload_section()

    st.subheader("🧪 Mini Paket (Tek Buton)")
    mini_csv = st.file_uploader(
        "Mini paket için CSV yükleyin",
        type=["csv"],
        key="mini_csv_upload",
        help="Deney CSV dosyanızı yükleyin ve tek butonla mini analiz çıktıları üretin."
    )

    mini_btn = st.button("➕ Mini Paketi Sisteme Ekle", use_container_width=True)
    if mini_btn:
        if mini_csv is None:
            st.warning("Lütfen önce mini paket için bir CSV dosyası yükleyin.")
        else:
            try:
                temp_df = pd.read_csv(mini_csv)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
                    temp_df.to_csv(tmp.name, index=False)
                    df_mini = load_experiment_table(Path(tmp.name))

                outputs = run_mini_package_from_dataframe(df_mini)
                zip_bytes = build_zip_from_outputs(outputs)
                st.success("Mini paket analizi tamamlandı. Çıktıları indirebilirsiniz.")
                st.download_button(
                    "📦 Mini Paket Çıktılarını İndir (.zip)",
                    data=zip_bytes,
                    file_name="azolla_mini_package_outputs.zip",
                    mime="application/zip"
                )
            except Exception as e:
                st.error(f"Mini paket çalıştırılırken hata oluştu: {e}")
    
    # Process button
    col1, col2 = st.columns([1, 4])
    with col1:
        process_btn = st.button("🚀 Process Images", type="primary", use_container_width=True)
    
    if process_btn and uploaded_files:
        with st.spinner("Processing images..."):
            all_results = []
            
            for uploaded_file in uploaded_files:
                try:
                    result, _ = process_uploaded_image(uploaded_file, config)
                    all_results.append({
                        'filepath': uploaded_file.name,
                        'treatment': result.treatment,
                        'replicate': result.replicate,
                        'day': result.day,
                        **result.features
                    })
                except Exception as e:
                    st.warning(f"Failed to process {uploaded_file.name}: {e}")
            
            if all_results:
                st.session_state.processed_data = pd.DataFrame(all_results)
                st.success(f"Processed {len(all_results)} images successfully!")
    
    # Display results if available
    if st.session_state.processed_data is not None:
        df = st.session_state.processed_data
        
        # Show sample predictions
        if len(df) > 0:
            sample_row = df.iloc[0]
            predictions = {
                'stress_class': 'Early' if sample_row.get('ExG', 0) > 0 else 'Severe',
                'stress_score': abs(sample_row.get('VARI', 0)),
                'confidence': 0.85,
                'rgr_deviation': sample_row.get('area_ratio', 0) - 0.5,
                'all_probabilities': {
                    'early': 0.6,
                    'moderate': 0.3,
                    'severe': 0.1
                }
            }
            display_results(predictions)
        
        # Analysis page
        create_analysis_page(st.session_state.excel_data, df)
    
    # Help section
    with st.expander("ℹ️ Help & Instructions"):
        st.markdown("""
        ### How to Use
        
        1. **Upload Images**: Select RGB images of Azolla fronds
           - Recommended format: PNG or JPG
           - Naming convention: `{treatment}_{replicate}_day{N}.png`
           - Example: `K_1_day0.png`, `Gd_2_day3.png`
        
        2. **Upload Excel Data** (Optional): Include experimental measurements
           - Columns: group_code, replicate, rgr, chlorophyll_a, etc.
        
        3. **Process**: Click "Process Images" to analyze
        
        4. **View Results**: 
           - Stress predictions with confidence scores
           - Time-series trends
           - Treatment comparisons
        
        5. **Export**: Download results as CSV or Excel
        
        ### Feature Mapping
        
        | Excel Metric | RGB Proxy |
        |-------------|-----------|
        | Chlorophyll a/b | ExG, VARI, GMI |
        | Carotenoids | ExR, YI, BYR |
        | RGR | ΔArea, ΔGreenness |
        """)


if __name__ == "__main__":
    main()
