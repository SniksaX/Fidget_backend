import { ethers } from "hardhat"; 

async function main() {
  const [deployer] = await ethers.getSigners(); 

  console.log(
    "Deploying FakeEURe contract with the account:",
    deployer.address 
  );
  const FakeEURe = await ethers.getContractFactory("FakeEURe");
  const fakeEURe = await FakeEURe.deploy();
  await fakeEURe.waitForDeployment();

  const deployedAddress = await fakeEURe.getAddress();
  console.log("FakeEURe deployed to:", deployedAddress);
  
  return deployedAddress; 
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});