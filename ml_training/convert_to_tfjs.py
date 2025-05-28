# convert_to_tfjs.py
import tensorflow as tf
import tensorflowjs as tfjs
import numpy as np

# Restore deprecated numpy aliases for tensorflowjs
setattr(np, "object", object)
setattr(np, "bool", bool)

def convert_model():
    # Load the model
    model = tf.keras.models.load_model("trained_model/phishing_detector_simple_nn.h5")
    
    # Create a new model with explicit input layer
    inputs = tf.keras.Input(shape=(16,), name='input_features')
    x = model.layers[0](inputs)
    for layer in model.layers[1:]:
        x = layer(x)
    new_model = tf.keras.Model(inputs=inputs, outputs=x)
    
    # Convert and save
    tfjs.converters.save_keras_model(
        new_model, 
        "tfjs_model",
        strip_debug_ops=True,
        include_weights=True
    )

if __name__ == "__main__":
    convert_model()
    print("✅ Model converted successfully!")
