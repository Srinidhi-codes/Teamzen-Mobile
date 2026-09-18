import { API_URL, graphqlRequest, authenticatedFetch } from './api';

export interface IssuedDocumentItem {
  id: string;
  category: string;
  title: string;
  financialYear?: string;
  fileName?: string;
  downloadUrl?: string;
  notes?: string;
  publishedAt?: string;
}

export interface DocumentRequestItem {
  id: string;
  category: string;
  title: string;
  description?: string;
  status: string; // 'open' | 'fulfilled' | 'cancelled'
  dueAt?: string;
  createdAt: string;
  fulfilledAt?: string;
  fileUrl?: string;
  verificationStatus?: string;
}

export interface VaultUploadItem {
  id: string;
  category: string;
  title: string;
  fileName?: string;
  fileUrl?: string;
  verificationStatus?: string; // 'pending' | 'verified' | 'rejected'
  rejectionReason?: string;
  source?: string;
  createdAt: string;
}

export interface MyDocumentsData {
  issued: IssuedDocumentItem[];
  requests: DocumentRequestItem[];
  uploads: VaultUploadItem[];
}

const MY_ISSUED_DOCUMENTS_QUERY = `
  query MyIssuedDocuments {
    myIssuedDocuments {
      id
      category
      title
      financialYear
      fileName
      downloadUrl
      notes
      publishedAt
    }
  }
`;

const MY_DOCUMENT_REQUESTS_QUERY = `
  query MyDocumentRequests($status: String) {
    myDocumentRequests(status: $status) {
      id
      category
      title
      description
      status
      dueAt
      createdAt
      fulfilledAt
      fileUrl
      verificationStatus
    }
  }
`;

const MY_VAULT_UPLOADS_QUERY = `
  query MyVaultUploads {
    myVaultUploads {
      id
      category
      title
      fileName
      fileUrl
      verificationStatus
      rejectionReason
      source
      createdAt
    }
  }
`;

export const DocumentService = {
  /**
   * Fetch all documents for employee (issued, HR requests, and vault uploads)
   */
  async fetchAllDocuments(): Promise<MyDocumentsData> {
    const [issuedRes, requestsRes, uploadsRes] = await Promise.all([
      graphqlRequest<{ myIssuedDocuments: IssuedDocumentItem[] }>(MY_ISSUED_DOCUMENTS_QUERY).catch(() => ({ myIssuedDocuments: [] })),
      graphqlRequest<{ myDocumentRequests: DocumentRequestItem[] }>(MY_DOCUMENT_REQUESTS_QUERY, { status: null }).catch(() => ({ myDocumentRequests: [] })),
      graphqlRequest<{ myVaultUploads: VaultUploadItem[] }>(MY_VAULT_UPLOADS_QUERY).catch(() => ({ myVaultUploads: [] })),
    ]);

    return {
      issued: issuedRes.myIssuedDocuments || [],
      requests: requestsRes.myDocumentRequests || [],
      uploads: uploadsRes.myVaultUploads || [],
    };
  },

  /**
   * Upload a document to fulfill an HR request or as a general employee upload
   */
  async uploadDocument(params: {
    fileUri: string;
    fileName: string;
    mimeType?: string;
    requestId?: string;
    category?: string;
    title?: string;
  }): Promise<boolean> {
    const formData = new FormData();
    formData.append('file', {
      uri: params.fileUri,
      name: params.fileName,
      type: params.mimeType || 'application/pdf',
    } as any);

    if (params.requestId) {
      formData.append('request_id', params.requestId);
    }
    if (params.category) {
      formData.append('category', params.category);
    }
    if (params.title) {
      formData.append('title', params.title);
    }

    const uploadUrl = `${API_URL}/api/documents/upload/`;
    const response = await authenticatedFetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        throw new Error(json.error || 'Upload failed');
      } catch {
        throw new Error(text || 'Upload failed');
      }
    }

    return true;
  },
};
