import cxrViralOpacityImg from '../assets/images/cxr_viral_opacity_1794865222335.jpg';
import cxrApicalTbImg from '../assets/images/cxr_apical_tb_1794865246040.jpg';
import thoracicCtAxialImg from '../assets/images/thoracic_ct_axial_1794865264910.jpg';
import lumbarSpineMriImg from '../assets/images/lumbar_spine_mri_1794865223607.jpg';
import mammogramCcCadImg from '../assets/images/mammogram_cc_cad_1794865223898.jpg';
import oncologyContrastMriImg from '../assets/images/oncology_contrast_mri_1794865223798.jpg';

export const PRESET_SCAN_IMAGE_URLS: Record<string, string> = {
  'cxr-covid-pneumonia': cxrViralOpacityImg,
  'cxr-hamlet-tb': cxrApicalTbImg,
  'ct-lungai-nodule': thoracicCtAxialImg,
  'spine-pfirrmann-l4l5': lumbarSpineMriImg,
  'mammo-birads4': mammogramCcCadImg,
  'onco-xai-lesion': oncologyContrastMriImg,
};
