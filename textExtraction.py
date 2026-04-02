from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

emb = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

def load_user_pdf(path):
    docs = PyMuPDFLoader(path).load()

    chunks = RecursiveCharacterTextSplitter(
        chunk_size=900,
        chunk_overlap=100
    ).split_documents(docs)

    return FAISS.from_documents(chunks, emb)