"""Reproducible nearest-template ONNX classifier, only for the bundled piece style.
No claim of generalization to photographic, arbitrary web or unseen piece styles.
Input RGB [1,3,64,64] in [0,1]; output logits [1,13].
"""
from pathlib import Path
import numpy as np
from PIL import Image
import onnx
import gzip
from onnx import helper as h, numpy_helper as nh, TensorProto as T

labels = ['.', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']
prototypes = []
for k in range(13):
    for theme in range(3):
        image = Image.open(f'model-data/theme-{theme}.png').convert('RGB')
        for j in range(2):
            i=k*2+j; x=(i%8)*64; y=(i//8)*64
            cell=image.crop((x,y,x+64,y+64))
            # Mild resampling augmentation covers screenshot scaling.
            for size in [48,64,80]:
                patch=cell.resize((size,size),Image.Resampling.BILINEAR).resize((64,64),Image.Resampling.BILINEAR)
                rgb=np.asarray(patch,dtype=np.float32).transpose(2,0,1)/255
                prototypes.append(rgb.reshape(3,16,4,16,4).mean(axis=(2,4)).reshape(-1))
prototypes=np.stack(prototypes)
# d(x,p)=sum(x²)-2*x*p+sum(p²). Output is negative mean distance * 400.
# A known match has logit close to 0; worker rejects built-in model matches below -8.
initializers=[nh.from_array(prototypes.T.copy(),'prototypes'),nh.from_array((prototypes**2).sum(1).reshape(1,-1),'norms'),
              nh.from_array(np.array(-2,dtype=np.float32),'minus2'),nh.from_array(np.array(-400/(3*16*16),dtype=np.float32),'scale'),
              nh.from_array(np.array([1,13,18],dtype=np.int64),'shape')]
nodes=[h.make_node('AveragePool',['image'],['features'],kernel_shape=[4,4],strides=[4,4]),h.make_node('Flatten',['features'],['x'],axis=1),h.make_node('Mul',['x','x'],['x2']),
       h.make_node('ReduceSum',['x2'],['xnorm'],axes=[1],keepdims=1),
       h.make_node('MatMul',['x','prototypes'],['dot']),h.make_node('Mul',['dot','minus2'],['twodot']),
       h.make_node('Add',['twodot','norms'],['partial']),h.make_node('Add',['partial','xnorm'],['distance']),
       h.make_node('Mul',['distance','scale'],['similarity']),h.make_node('Reshape',['similarity','shape'],['perclass']),
       h.make_node('ReduceMax',['perclass'],['logits'],axes=[2],keepdims=0)]
graph=h.make_graph(nodes,'bundled-pieces-template-classifier',[h.make_tensor_value_info('image',T.FLOAT,[1,3,64,64])],[h.make_tensor_value_info('logits',T.FLOAT,[1,13])],initializers)
model=h.make_model(graph,opset_imports=[h.make_opsetid('',12)],producer_name='Chess Vision Trainer local templates')
model.ir_version=8
model.doc_string='Nearest-template classifier for the three bundled themes and react-chessboard 4.7.3 pieces only. Synthetic data; not a universal chess recognition model.'
onnx.checker.check_model(model)
Path('public/models').mkdir(parents=True,exist_ok=True)
data=model.SerializeToString()
with gzip.open('public/models/bundled-pieces.onnx.gz','wb',compresslevel=9) as f: f.write(data)
print('Saved compressed model:',Path('public/models/bundled-pieces.onnx.gz').stat().st_size,'bytes; labels:',labels)
