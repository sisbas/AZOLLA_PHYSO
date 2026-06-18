import numpy as np

from backend.core.segmentation import SegmentationModule


def test_vegetation_indices_use_rgb_channel_order_for_green_dominant_image():
    module = SegmentationModule({"segmentation": {}})

    rgb_green = np.zeros((4, 4, 3), dtype=np.uint8)
    rgb_green[:, :] = [20, 200, 30]

    r = rgb_green[:, :, 0].astype(np.float32)
    g = rgb_green[:, :, 1].astype(np.float32)
    b = rgb_green[:, :, 2].astype(np.float32)

    exg = module.calculate_exg(rgb_green)
    trex = module.calculate_trex(r, g, b)
    exr = module.calculate_exr(r, g, b)
    indices = module.calculate_indices(r, g, b)

    # Green-dominant RGB input should yield positive ExG and low/red-stress indices.
    assert np.all(exg > 0)
    assert np.all(trex < 128)
    assert np.all(exr == 0)
    np.testing.assert_allclose(indices["TREx"], trex)
    np.testing.assert_allclose(indices["ExR"], exr)
    assert np.all(indices["GR"] > 1)
