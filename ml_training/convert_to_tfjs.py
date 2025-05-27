# convert_to_tfjs.py
import numpy as np
# restore the deprecated aliases just for tensorflowjs
setattr(np, "object", object)
setattr(np, "bool", bool)

import tensorflow as tf
import tensorflowjs as tfjs

# load your Keras .h5 model
model = tf.keras.models.load_model("trained_model/phishing_detector_simple_nn.h5")

# save it in TF.js format under ./tfjs_model
tfjs.converters.save_keras_model(model, "tfjs_model")

print("✅ Conversion complete! Check the ./tfjs_model folder.")
