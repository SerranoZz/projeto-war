import ImageGL from "../view/image";
import GLUtil from "./gl-util";
import HalfEdgeDS from "./half-edge";
import Mesh from "./mesh";
import { mat4 } from "gl-matrix";

export default class IndexedMeshT extends Mesh{
    #hEdge;
    #indicesLoc = -1;

    constructor(gl, vertShaderSrc, fragShaderSrc, indexes){
        super(gl, vertShaderSrc, fragShaderSrc, gl.TRIANGLES);

        this.#hEdge = new HalfEdgeDS(indexes);
    }

    addAttribute(name, info, pointDim = 4){
        if(!(info instanceof Array))
            throw new Error("The info parameter needs to be a Array.");

        info.forEach(val => {
            if(typeof val !== "number") 
                throw new Error("The info array need to be numeric.");
        });

        if(this._gl.getAttribLocation(this._program, name)===-1)
            throw new Error(`the attribute ${name} doesn't exists in the shader code.`);


        this.#hEdge.setAttribute(info, pointDim, name);        
    }

    createVAO() {
        const vbos = this.#hEdge.createVBOs();

        const attributes = Array.from(vbos.attributes.entries()).map(entry => {

            return {
                loc: this._gl.getAttribLocation(this._program, entry[0]),
                buffer: GLUtil.createBuffer(this._gl, this._gl.ARRAY_BUFFER, new Float32Array(entry[1])),
                dimension: Math.round(entry[1].length/vbos.count)
            }
        })

        this._vaoLoc = GLUtil.createVAO(this._gl, ...attributes);
        this.#indicesLoc = GLUtil.createBuffer(this._gl, this._gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(vbos.indexes));

        this._count = vbos.indexes.length;
    }

    draw(cam){
        if(!(this._gl instanceof WebGL2RenderingContext))return

        this._gl.frontFace(this._gl.CCW);

        this._gl.enable(this._gl.CULL_FACE);
        this._gl.cullFace(this._gl.BACK);

        this._gl.bindVertexArray(this._vaoLoc);

        this._gl.useProgram(this._program);

        this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, this.#indicesLoc);

        const modelLoc = this._gl.getUniformLocation(this._program, "model");
        const mvLoc = this._gl.getUniformLocation(this._program, "modelView");
        const mvpLoc = this._gl.getUniformLocation(this._program, "mvp");

        if(modelLoc){
            this._gl.uniformMatrix4fv(modelLoc, false, this.modelMatrix);
        }else if(mvLoc){
            const mv = mat4.create();
            mat4.multiply(mv, cam.viewMatrix, this.modelMatrix);
            this._gl.uniformMatrix4fv(modelLoc, false, mv);
        }else if(mvpLoc){
            const mvp = mat4.create();
            mat4.multiply(mvp, cam.viewProjection, this.modelMatrix);
            this._gl.uniformMatrix4fv(modelLoc, false, mvp);
        }
        
        this._gl.drawElements(this._primitive, this._count, this._gl.UNSIGNED_INT, 0);

        this._gl.disable(this._gl.CULL_FACE);
    }

    static async loadMeshFromObj(path, gl, vertShader, fragShader, texturePath){
        const obj = await fetch(path);
        const text = await obj.text();

        const border = new Map();
    
        const lines = text.split("\n");

        const vertices = [];
        const normals = [];
        const texCoords = [];
        const indexes = [];

        let borderIndex = 0;

        for(let line of lines){
            if(line.startsWith("vn")){
                const values = line.replace("vn ", "").split(" ").map(Number.parseFloat);
                normals.push(...values, 1);

                const d = Math.sqrt(dotProduct(values, values));
                console.log(d);

                if(dotProduct(values, [0, 0, 1])/d<0.5){
                    const key = values.join(",");
                    if(!border.get(key)) border.set(key, borderIndex);
                }

                borderIndex++;
            }else if(line.startsWith("vt")){
                const values = line.replace("vt ", "").split(" ").map(Number.parseFloat);
                texCoords.push(...values);
            }else if(line.startsWith("v")){
                const values = line.replace("v ", "").split(" ").map(Number.parseFloat);
                vertices.push(...values, 1);
            }else if(line.startsWith("f")){
                const values = line.replace("f ", "").split(" ").map(val => {
                    const init = val.indexOf("/");
                    const vIndex = val.slice(0, init);
                    return Number.parseInt(vIndex)-1;
                });
                indexes.push(...values);
            }

        }

        //console.log(border.values());

        const mesh = new IndexedMeshT(gl, vertShader, fragShader, indexes);
        mesh.addAttribute("position", vertices);
        mesh.addAttribute("normal", normals);

        if(texCoords.length!==0){
            if(!texturePath)
                throw new Error("This mesh need to a texture path");

            mesh.addAttribute("texCoord", texCoords, 3);

            const image = await ImageGL.loadImage(texturePath);

            mesh.createTex(image, "uTexture");
        }

        return mesh;
    }
}

const dotProduct = (v1, v2) =>{
    return v1.reduce((ac, curr, i)=>ac+=curr*v2[i], 0);
}