import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface DocumentFile {
  id: string;
  file: File;
  type: string;
  name: string;
  customName?: string;
}

export interface DocumentTypeOption {
  value: string;
  label: string;
}

interface DocumentUploadProps {
  onDocumentsChange: (documents: DocumentFile[]) => void;
  maxFiles?: number;
  maxSizePerFile?: number; // in MB
  documentTypes?: DocumentTypeOption[];
  description?: string;
  resetKey?: number;
  disabled?: boolean;
}

const defaultDocumentTypes: DocumentTypeOption[] = [
  { value: "id_passport", label: "ID/Passport" },
  { value: "bipa_registration", label: "BIPA/Company Registration" },
  { value: "proof_of_address", label: "Proof of Address" },
  { value: "other", label: "Other" }
];

const DocumentUpload = ({
  onDocumentsChange,
  maxFiles = 3,
  maxSizePerFile = 4,
  documentTypes = defaultDocumentTypes,
  description,
  resetKey = 0,
  disabled = false
}: DocumentUploadProps) => {
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setDocuments([]);
    onDocumentsChange([]);
  }, [onDocumentsChange, resetKey]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      event.target.value = '';
      return;
    }

    const files = Array.from(event.target.files || []);
    
    if (documents.length + files.length > maxFiles) {
      toast({
        title: "Too Many Files",
        description: `Maximum ${maxFiles} documents allowed`,
        variant: "destructive"
      });
      return;
    }

    const validFiles: DocumentFile[] = [];

    files.forEach(file => {
      if (file.size > maxSizePerFile * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: `${file.name} exceeds ${maxSizePerFile}MB limit`,
          variant: "destructive"
        });
        return;
      }

      const docFile: DocumentFile = {
        id: `${Date.now()}-${Math.random()}`,
        file,
        type: '',
        name: file.name
      };

      validFiles.push(docFile);
    });

    const newDocuments = [...documents, ...validFiles];
    setDocuments(newDocuments);
    onDocumentsChange(newDocuments);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDocumentTypeChange = (documentId: string, type: string) => {
    const updatedDocuments = documents.map(doc => 
      doc.id === documentId ? { ...doc, type, customName: type === "other" ? doc.customName : "" } : doc
    );
    setDocuments(updatedDocuments);
    onDocumentsChange(updatedDocuments);
  };

  const handleCustomNameChange = (documentId: string, customName: string) => {
    const updatedDocuments = documents.map(doc =>
      doc.id === documentId ? { ...doc, customName } : doc
    );
    setDocuments(updatedDocuments);
    onDocumentsChange(updatedDocuments);
  };

  const removeDocument = (documentId: string) => {
    const updatedDocuments = documents.filter(doc => doc.id !== documentId);
    setDocuments(updatedDocuments);
    onDocumentsChange(updatedDocuments);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Upload Documentation</Label>
        <p className="text-sm text-gray-600 mb-3">
          {description || `Upload up to ${maxFiles} documents (max ${maxSizePerFile}MB each).`}
        </p>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={disabled}
          onChange={handleFileSelect}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          className="hidden"
        />
        
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!disabled) fileInputRef.current?.click();
          }}
          disabled={disabled || documents.length >= maxFiles}
          className="w-full"
        >
          <Upload className="w-4 h-4 mr-2" />
          Choose Files ({documents.length}/{maxFiles})
        </Button>
      </div>

      {documents.length > 0 && (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-start space-x-3">
                <FileText className="w-5 h-5 mt-1 text-gray-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.name}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDocument(doc.id)}
                      disabled={disabled}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    {formatFileSize(doc.file.size)}
                  </p>
                  <Select
                    value={doc.type}
                    onValueChange={(value) => handleDocumentTypeChange(doc.id, value)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {doc.type === "other" && (
                    <div className="mt-3">
                      <Label htmlFor={`custom-document-name-${doc.id}`}>Document name</Label>
                      <Input
                        id={`custom-document-name-${doc.id}`}
                        value={doc.customName || ""}
                        onChange={event => handleCustomNameChange(doc.id, event.target.value)}
                        placeholder="Enter the document name"
                        className="mt-1"
                        disabled={disabled}
                        required
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
