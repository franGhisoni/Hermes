CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pagePictureUrl" TEXT,
    "igUserId" TEXT,
    "igUsername" TEXT,
    "pageToken" TEXT NOT NULL,
    "connectedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialAccount_pageId_key" ON "SocialAccount"("pageId");
