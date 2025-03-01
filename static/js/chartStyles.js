// Reusable D3 style functions
const axisTextStyle = (selection) => {
  selection
    .style("font-size", "18px")
    .style("font-weight", "500")
    .style("fill", "black");
};

const axisTitleStyle = (selection) => {
  selection
    .style("text-anchor", "middle")
    .style("font-size", "22px")
    .style("font-weight", "bold");
}; 